import { t, localizer } from '../../core/localizer';
import { localize } from './helper';

import { prefs } from '../../core/preferences';
import { fileFetcher } from '../../core/file_fetcher';
import { coreGraph } from '../../core/graph';
import { modeBrowse } from '../../modes/browse';
import { osmEntity } from '../../osm/entity';
import { services } from '../../services';
import { svgIcon } from '../../svg/icon';
import { uiCurtain } from '../curtain';
import { utilArrayDifference, utilArrayUniq } from '../../util';

import { uiIntroWelcome } from './welcome';
import { uiIntroNavigation } from './navigation';
import { uiIntroPoint } from './point';
import { uiIntroArea } from './area';
import { uiIntroLine } from './line';
import { uiIntroBuilding } from './building';
import { uiIntroStartEditing } from './start_editing';
import { uiIntroRapid } from './rapid';

const chapterUi = {
  welcome: uiIntroWelcome,
  navigation: uiIntroNavigation,
  point: uiIntroPoint,
  area: uiIntroArea,
  line: uiIntroLine,
  building: uiIntroBuilding,
  rapid: uiIntroRapid,
  startEditing: uiIntroStartEditing
};

const chapterFlow = [
  'welcome',
  'navigation',
  'point',
  'area',
  'line',
  'building',
  'rapid',
  'startEditing'
];


export function uiIntro(context, skipToRapid) {
  const INTRO_IMAGERY = 'EsriWorldImageryClarity';
  let _introGraph = {};
  let _rapidGraph = {};
  let _currChapter;


  function intro(selection) {
    Promise.all([
      fileFetcher.get('intro_rapid_graph'),
      fileFetcher.get('intro_graph')
    ])
    .then(values => {
      const rapidData = values[0];
      const introData = values[1];

      for (const id in rapidData) {
        if (!_rapidGraph[id]) {
          _rapidGraph[id] = osmEntity(localize(rapidData[id]));
        }
      }
      for (const id in introData) {
        if (!_introGraph[id]) {
          _introGraph[id] = osmEntity(localize(introData[id]));
        }
      }

      selection.call(startIntro, skipToRapid);
    });
  }


  function startIntro(selection) {
    context.enter(modeBrowse(context));

    // Save current map state
    let osm = context.connection();
    let history = context.history().toJSON();
    let hash = window.location.hash;
    let center = context.map().center();
    let zoom = context.map().zoom();
    let background = context.background().baseLayerSource();
    let overlays = context.background().overlayLayerSources();
    let opacity = context.container().selectAll('.main-map .layer-background').style('opacity');
    let caches = osm && osm.caches();
    let baseEntities = context.history().graph().base().entities;

    // Show sidebar and disable the sidebar resizing button
    // (this needs to be before `context.inIntro(true)`)
    context.ui().sidebar.expand();
    context.container().selectAll('button.sidebar-toggle').classed('disabled', true);

    // Block saving
    context.inIntro(true);

    // Load semi-real data used in intro
    if (osm) { osm.toggle(false).reset(); }
    context.history().reset();
    context.history().merge(Object.values(coreGraph().load(_introGraph).entities));
    context.history().checkpoint('initial');

    // Setup imagery
    let imagery = context.background().findSource(INTRO_IMAGERY);
    if (imagery) {
      context.background().baseLayerSource(imagery);
    } else {
      context.background().bing();
    }
    overlays.forEach(d => context.background().toggleOverlayLayer(d));

    // Setup data layers (only OSM & ai-features)
    let layers = context.layers();
    layers.all().forEach(item => {
      // if the layer has the function `enabled`
      if (typeof item.layer.enabled === 'function') {
        item.layer.enabled(item.id === 'osm' || item.id === 'ai-features');
      }
    });

    // Setup RapiD Walkthrough dataset and disable service
    let rapidDatasets = context.rapidContext().datasets();
    const rapidDatasetsCopy = JSON.parse(JSON.stringify(rapidDatasets));   // deep copy
    Object.keys(rapidDatasets).forEach(id => rapidDatasets[id].enabled = false);

    rapidDatasets.rapid_intro_graph = {
      id: 'rapid_intro_graph',
      beta: false,
      added: true,
      enabled: true,
      conflated: false,
      service: 'fbml',
      color: '#da26d3',
      label: 'RapiD Walkthrough'
    };

    if (services.fbMLRoads) {
      services.fbMLRoads.toggle(false);    // disable network
      const entities = Object.values(coreGraph().load(_rapidGraph).entities);
      services.fbMLRoads.merge('rapid_intro_graph', entities);
    }

    context.container().selectAll('.main-map .layer-background').style('opacity', 1);

    let curtain = uiCurtain(context.container().node());
    selection.call(curtain);

    // Store that the user started the walkthrough..
    prefs('walkthrough_started', 'yes');

    // Restore previous walkthrough progress..
    let storedProgress = prefs('walkthrough_progress') || '';
    let progress = storedProgress.split(';').filter(Boolean);

    let chapters = chapterFlow.map((chapter, i) => {
      let s = chapterUi[chapter](context, curtain.reveal)
        .on('done', () => {

          buttons
            .filter(d => d.title === s.title)
            .classed('finished', true);

          if (i < chapterFlow.length - 1) {
            const next = chapterFlow[i + 1];
            context.container().select(`button.chapter-${next}`)
              .classed('next', true);
          }

          // Store walkthrough progress..
          progress.push(chapter);
          prefs('walkthrough_progress', utilArrayUniq(progress).join(';'));
        });
      return s;
    });

    chapters[chapters.length - 1].on('startEditing', () => {
      // Store walkthrough progress..
      progress.push('startEditing');
      prefs('walkthrough_progress', utilArrayUniq(progress).join(';'));

      // Store if walkthrough is completed..
      let incomplete = utilArrayDifference(chapterFlow, progress);
      if (!incomplete.length) {
        prefs('walkthrough_completed', 'yes');
      }

      // Restore RapiD datasets and service
      let rapidDatasets = context.rapidContext().datasets();
      delete rapidDatasets.rapid_intro_graph;
      Object.keys(rapidDatasetsCopy).forEach(id => rapidDatasets[id].enabled = rapidDatasetsCopy[id].enabled);
      Object.assign(rapidDatasets, rapidDatasetsCopy);
      if (services.fbMLRoads) {
        services.fbMLRoads.toggle(true);
      }

      curtain.remove();
      navwrap.remove();
      context.container().selectAll('.main-map .layer-background').style('opacity', opacity);
      context.container().selectAll('button.sidebar-toggle').classed('disabled', false);
      if (osm) { osm.toggle(true).reset().caches(caches); }
      context.history().reset().merge(Object.values(baseEntities));
      context.background().baseLayerSource(background);
      overlays.forEach(d => context.background().toggleOverlayLayer(d));
      if (history) { context.history().fromJSON(history, false); }
      context.map().centerZoom(center, zoom);
      window.location.replace(hash);
      context.inIntro(false);
    });

    let navwrap = selection
      .append('div')
      .attr('class', 'intro-nav-wrap fillD');

    navwrap
      .append('svg')
      .attr('class', 'intro-nav-wrap-logo')
      .append('use')
      .attr('xlink:href', '#iD-logo-walkthrough');

    let buttonwrap = navwrap
      .append('div')
      .attr('class', 'joined')
      .selectAll('button.chapter');

    let buttons = buttonwrap
      .data(chapters)
      .enter()
      .append('button')
      .attr('class', (d, i) => `chapter chapter-${chapterFlow[i]}`)
      .on('click', enterChapter);

    buttons
      .append('span')
      .html(d => t.html(d.title));

    buttons
      .append('span')
      .attr('class', 'status')
      .call(svgIcon((localizer.textDirection() === 'rtl' ? '#iD-icon-backward' : '#iD-icon-forward'), 'inline'));

    enterChapter(null, chapters[skipToRapid ? 6 : 0]);

    function enterChapter(d3_event, newChapter) {
      if (_currChapter) _currChapter.exit();
      context.enter(modeBrowse(context));

      _currChapter = newChapter;
      _currChapter.enter();

      buttons
        .classed('next', false)
        .classed('active', d => d.title === _currChapter.title);
    }
  }


  return intro;
}
