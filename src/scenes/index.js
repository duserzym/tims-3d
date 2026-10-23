// Scene registry (order = navigation order).
import instrument from './instrument.js';
import nuBrochure from './nuBrochure.js';
import faraday from './faraday.js';
import amplifier from './amplifier.js';
import detectorSignal from './detectorSignal.js';
import daly from './daly.js';
import ionCounter from './ionCounter.js';
import compare from './compare.js';
import source from './source.js';
import filaments from './filaments.js';
import totalEvap from './totalEvap.js';

export const SCENES = [instrument, nuBrochure, source, filaments, faraday, amplifier, daly, ionCounter, detectorSignal, compare, totalEvap];
