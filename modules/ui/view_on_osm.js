import { osmEntity, osmNote } from '../osm';
import { uiIcon } from './icon';


export function uiViewOnOSM(context) {
  const l10n = context.systems.l10n;
  const osm = context.services.osm;
  let _what;   // an osmEntity or osmNote


  function viewOnOSM(selection) {
    let url;
    if (osm && _what instanceof osmEntity && !_what.isNew()) {
      url = osm.entityURL(_what);
    } else if (osm && _what instanceof osmNote && !_what.isNew()) {
      url = osm.noteURL(_what);
    }

    const link = selection.selectAll('.view-on-osm')
      .data(url ? [url] : [], d => d);

    // exit
    link.exit()
      .remove();

    // enter
    const linkEnter = link.enter()
      .append('a')
      .attr('class', 'view-on-osm')
      .attr('target', '_blank')
      .attr('href', d => d)
      .call(uiIcon('#rapid-icon-out-link', 'inline'));

    linkEnter
      .append('span')
      .text(l10n.t('inspector.view_on_osm'));
  }


  viewOnOSM.what = function(val) {
    if (!arguments.length) return _what;
    _what = val;
    return viewOnOSM;
  };

  return viewOnOSM;
}
