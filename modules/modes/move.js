import { select as d3_select } from 'd3-selection';
import { vecLength, vecSubtract, geomViewportNudge } from '@id-sdk/math';

import { t } from '../core/localizer';
import { actionMove } from '../actions/move';
import { actionNoop } from '../actions/noop';
import { locationManager } from '../core/LocationManager';
import { modeSelect } from './select';
import { utilKeybinding } from '../util';
import { utilFastMouse } from '../util/util';

import { operationCircularize } from '../operations/circularize';
import { operationDelete } from '../operations/delete';
import { operationOrthogonalize } from '../operations/orthogonalize';
import { operationReflectLong, operationReflectShort } from '../operations/reflect';
import { operationRotate } from '../operations/rotate';


export function modeMove(context, entityIDs, baseGraph) {
    var _tolerancePx = 4; // see also behaviorDrag, behaviorSelect, modeRotate

    var mode = {
        id: 'move',
        button: 'browse'
    };

    var keybinding = utilKeybinding('move');
//    var behaviors = [
//        operationCircularize(context, entityIDs).behavior,
//        operationDelete(context, entityIDs).behavior,
//        operationOrthogonalize(context, entityIDs).behavior,
//        operationReflectLong(context, entityIDs).behavior,
//        operationReflectShort(context, entityIDs).behavior,
//        operationRotate(context, entityIDs).behavior
//    ];
    var annotation = entityIDs.length === 1 ?
        t('operations.move.annotation.' + context.graph().geometry(entityIDs[0])) :
        t('operations.move.annotation.feature', { n: entityIDs.length });

    var _prevGraph;
    var _cache;
    var _origin;
    var _nudgeInterval;


    function doMove(nudge) {
        nudge = nudge || [0, 0];

        var fn;
        if (_prevGraph !== context.graph()) {
            _cache = {};
            _origin = context.map().mouseLoc();
            fn = context.perform;
        } else {
            fn = context.overwrite;
        }

        var currMouse = context.map().mouse();
        var origMouse = context.projection.project(_origin);
        var delta = vecSubtract(vecSubtract(currMouse, origMouse), nudge);
        var loc = context.projection.invert(currMouse);

        if (locationManager.blocksAt(loc).length) {  // editing is blocked here
            cancel();
            return;
        }

        fn(actionMove(entityIDs, delta, context.projection, _cache));
        _prevGraph = context.graph();
    }


    function startNudge(nudge) {
        if (_nudgeInterval) window.clearInterval(_nudgeInterval);
        _nudgeInterval = window.setInterval(function() {
            context.map().pan(nudge);
            doMove(nudge);
        }, 50);
    }


    function stopNudge() {
        if (_nudgeInterval) {
            window.clearInterval(_nudgeInterval);
            _nudgeInterval = null;
        }
    }


    function move() {
        doMove();
        var nudge = geomViewportNudge(context.map().mouse(), context.map().dimensions);
        if (nudge) {
            startNudge(nudge);
        } else {
            stopNudge();
        }
    }


    function finish(d3_event) {
        d3_event.stopPropagation();
        context.replace(actionNoop(), annotation);
        context.enter(modeSelect(context, entityIDs));
        stopNudge();
    }


    function cancel() {
        if (baseGraph) {
            while (context.graph() !== baseGraph) context.pop();  // reset to baseGraph
            context.enter('browse');
        } else {
            if (_prevGraph) context.pop();   // remove the move
            context.enter(modeSelect(context, entityIDs));
        }
        stopNudge();
    }


    function undone() {
        context.enter('browse');
    }


    mode.enter = function() {
        _origin = context.map().mouseLoc();
        _prevGraph = null;
        _cache = {};

        context.features().forceVisible(entityIDs);

        // behaviors.forEach(context.install);

        var downEvent;

        context.surface()
            .on('pointerdown.modeMove', function(d3_event) {
                downEvent = d3_event;
            });

        d3_select(window)
            .on('pointermove.modeMove', move, true)
            .on('pointerup.modeMove', function(d3_event) {
                if (!downEvent) return;
                var mapNode = context.container().select('.main-map').node();
                var pointGetter = utilFastMouse(mapNode);
                var p1 = pointGetter(downEvent);
                var p2 = pointGetter(d3_event);
                var dist = vecLength(p1, p2);

                if (dist <= _tolerancePx) finish(d3_event);
                downEvent = null;
            }, true);

        context.history()
            .on('undone.modeMove', undone);

        keybinding
            .on('⎋', cancel)
            .on('↩', finish);

        d3_select(document)
            .call(keybinding);
    return true;
    };


    mode.exit = function() {
        stopNudge();

//        behaviors.forEach(function(behavior) {
//            context.uninstall(behavior);
//        });

        context.surface()
            .on('pointerdown.modeMove', null);

        d3_select(window)
            .on('pointermove.modeMove', null, true)
            .on('pointerup.modeMove', null, true);

        context.history()
            .on('undone.modeMove', null);

        d3_select(document)
            .call(keybinding.unbind);

        context.features().forceVisible([]);
    };


    mode.selectedIDs = function() {
        if (!arguments.length) return entityIDs;
        // no assign
        return mode;
    };


    return mode;
}
