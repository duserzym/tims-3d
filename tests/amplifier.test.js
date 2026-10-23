import { describe,it,expect } from 'vitest';
import { resistiveStep,capacitiveRamp,currentFromSlope,amplifierTrace,discriminatorEvents } from '../src/physics/amplifier.js';
describe('electrometer feedback circuits',()=>{
 it('reaches 1−1/e of the inverting steady response after RC',()=>expect(resistiveStep(1e-12,1e12,1e-12,1)).toBeCloseTo(-(1-Math.exp(-1)),12));
 it('recovers the input current from the capacitive voltage slope',()=>{const I=2e-13,C=1.4e-12,t=2.4;expect(currentFromSlope(capacitiveRamp(I,C,t),C,t)).toBeCloseTo(I,24);});
 it('holds integrated charge when the beam is off, and resets it only in the reset phase',()=>{const r=amplifierTrace({kind:'capacitor',window:4});const j=Math.round(6/.01);expect(r.v[j]).toBeCloseTo(r.v[j+10],12);expect(r.v[Math.round(4.1/.01)]).toBe(0);});
 it('starts each capacitive integration window at zero without a sample offset',()=>{const r=amplifierTrace({kind:'capacitor'});expect(r.v[220]).toBeCloseTo(0,12);expect(r.v[300]).toBeCloseTo(-.08,12);});
 it('clips a large input at the teaching output rails',()=>{const r=amplifierTrace({current:1e-9});expect(Math.min(...r.v)).toBe(-10);expect(Math.max(...r.v)).toBeLessThanOrEqual(10);});
 it('distinguishes threshold rejection from counter dead time',()=>{const e=discriminatorEvents([10,20,48,75],[1,.8,.25,1.2],.4,20);expect(e.map(x=>x.reason)).toEqual(['Counted','Inside dead time','Below threshold','Counted']);});
});
