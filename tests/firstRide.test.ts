import { describe, expect, it, vi } from 'vitest';
import { FirstRide } from '../src/game/firstRide';
import type { Game } from '../src/game/game';
import { EventBus } from '../src/core/events';
import { frameOf } from '../src/core/input';

function fixture() {
  const events = new EventBus();
  const vehicle = { grounded: true, speed: 0 };
  const rider = { state: 'seated', hanging: false, hang: vi.fn(() => { rider.state = 'hanging'; rider.hanging = true; }) };
  const respawn = vi.fn(() => { rider.state = 'seated'; rider.hanging = false; events.emit('run_reset', {}); });
  const complete = vi.fn();
  const ride = new FirstRide({ events, vehicle, rider, respawn } as unknown as Game, complete);
  ride.start();
  const next = () => ride.step(1.4, frameOf());
  const drive = () => {
    vehicle.speed = 8;
    ride.step(1, frameOf({ throttle: 1 }));
    vehicle.speed = 0;
    ride.step(0.1, frameOf({ brake: 1 }));
    next();
    ride.step(0.7, frameOf());
  };
  const land = () => events.emit('landed', { quality: 'clean', airTime: 1, fakie: false, impact: 5, reason: 'clean' });
  const jump = () => { events.emit('ollie', { charge: 1 }); land(); next(); ride.step(0.7, frameOf()); };
  return { ride, vehicle, rider, events, respawn, complete, next, drive, land, jump };
}

describe('First Ride progression', () => {
  it('requires moving and braking; idle time cannot complete the first lesson', () => {
    const { ride, drive } = fixture();
    ride.step(60, frameOf());
    expect(ride.lesson).toBe(0);
    drive();
    expect(ride.lesson).toBe(1);
  });

  it('requires an intentional jump and a landed, banked flip before recovery', () => {
    const f = fixture();
    f.drive();
    f.land(); // spawn settling or riding off something is not the jump lesson
    f.next();
    expect(f.ride.lesson).toBe(1);
    f.jump();
    expect(f.ride.lesson).toBe(2);
    f.events.emit('ollie', { charge: 1 });
    f.events.emit('trick_completed', { id: 'kickflip', name: 'KICKFLIP', points: 250, kind: 'flip' });
    f.next();
    expect(f.ride.lesson).toBe(2); // an airborne trick alone is insufficient
    f.land();
    f.events.emit('combo_lost', { score: 250, reason: 'bailed' });
    f.events.emit('combo_banked', { score: 50, names: ['MANUAL'], tricks: 1, multiplier: 1 });
    f.next();
    expect(f.ride.lesson).toBe(2); // a later unrelated combo cannot complete it
    f.events.emit('ollie', { charge: 1 });
    f.events.emit('trick_completed', { id: 'kickflip', name: 'KICKFLIP', points: 250, kind: 'flip' });
    f.land();
    f.events.emit('combo_banked', { score: 250, names: ['KICKFLIP'], tricks: 1, multiplier: 1 });
    f.next();
    expect(f.ride.lesson).toBe(3);
    expect(f.rider.hang).not.toHaveBeenCalled();
    f.ride.step(2.1, frameOf());
    expect(f.rider.hang).toHaveBeenCalledOnce();
    f.events.emit('rider_recovered', { fromOneHand: false, dragMetres: 3 });
    f.rider.state = 'recovering';
    f.ride.step(0.2, frameOf());
    expect(f.complete).not.toHaveBeenCalled();
    f.rider.state = 'seated';
    f.rider.hanging = false;
    f.ride.step(0.2, frameOf());
    f.next();
    expect(f.complete).toHaveBeenCalledOnce();
    expect(f.ride.active).toBe(false);
  });

  it('retries the current lesson and stopping prevents delayed completion', () => {
    const { ride, drive, rider, respawn, complete } = fixture();
    drive();
    rider.state = 'detached';
    ride.step(0.1, frameOf());
    ride.step(1.1, frameOf());
    expect(ride.lesson).toBe(1);
    expect(respawn).toHaveBeenCalledTimes(3);
    ride.stop();
    ride.step(60, frameOf());
    expect(complete).not.toHaveBeenCalled();
  });
});
