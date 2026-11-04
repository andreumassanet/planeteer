/** The Dispatcher's and the Course marshal's topics: jobs and commissions, rings and courses. */
import type { LoreTopic } from './types.ts';

export const WORK: readonly LoreTopic[] = [
  {
    id: 'jobs',
    title: 'Jobs',
    icon: 'hand',
    role: 'dispatcher',
    summary: 'Finding work, taking it on, finishing it and giving it up.',
    pages: [
      {
        heading: 'Work everywhere',
        text:
          'Every town has work going: errands, fares, loads and rescues. The jobs on offer are the same for every player, and a new day’s worth arrives at midnight, UTC. Each job can be done once.',
      },
      {
        heading: 'Finding one',
        text:
          'Press {jobs} to head for the nearest job: an orange line of chevrons leads the way and a beam of light marks the spot. Press {jobs} again for the next nearest, and once more after the last to stop. Tags float over the jobs waiting near you.',
        touch:
          'Tags float over the jobs waiting near you, each with how far away it is. Errands are carried by the townsfolk themselves, so ask around in town.',
      },
      {
        heading: 'Taking it on',
        text:
          'Get to the job and press {use} when the prompt offers it. The clock starts at once and an orange line leads you to where it ends. A card shows where you are going, how far it is, your time and the par.',
        touch:
          'Get to the job and tap the button when it offers the job. The clock starts at once and an orange line leads you to where it ends. A card shows where you are going, how far it is, your time and the par.',
      },
      {
        heading: 'Finishing',
        text:
          'Stop inside the drop to finish. Whoever or whatever you picked up must arrive in the same vehicle, so do not swap rides on the way. Leave the vehicle and a passenger waits a little while, then gives up. A wreck ends the job too.',
      },
      {
        heading: 'Giving up',
        text: 'Changed your mind? Press {jobs} twice, quickly, to give up the job you are on. Nobody minds, and the job is still there to try again.',
        touch: 'Changed your mind? Leave the vehicle and walk off: after a while your passenger gives up waiting, and the job is still there to try again.',
      },
    ],
  },
  {
    id: 'job-kinds',
    title: 'Errands, fares, loads and rescues',
    icon: 'scroll',
    role: 'dispatcher',
    summary: 'The four kinds of job, and how each one is picked up and delivered.',
    pages: [
      {
        heading: 'Errands',
        text:
          'Some townsfolk have a parcel that needs taking to a town a few roads away, and a tag over their head says Errand. Walk up and press {use} on foot to take it, then walk, ride or drive there and stop inside the drop.',
        touch:
          'Some townsfolk have a parcel that needs taking to a town a few roads away, and a tag over their head says Errand. Walk up and tap the button on foot to take it, then walk, ride or drive there and stop inside the drop.',
      },
      {
        heading: 'Fares',
        text:
          'People wave for a lift on the verge just outside a town’s gates. Stop beside them in anything on the road with a seat to spare and press {use} to pick them up. Then drive them to their town.',
        touch:
          'People wave for a lift on the verge just outside a town’s gates. Stop beside them in anything on the road with a seat to spare and tap the button to pick them up. Then drive them to their town.',
      },
      {
        heading: 'Loads',
        text:
          'Crates are stacked beside many airstrips, waiting to go to another strip far away. Land beside them in an aircraft with a seat to spare and press {use} to load up. Then fly to the other strip and land inside the drop.',
        touch:
          'Crates are stacked beside many airstrips, waiting to go to another strip far away. Land beside them in an aircraft with a seat to spare and tap the button to load up. Then fly to the other strip and land inside the drop.',
      },
      {
        heading: 'Rescues',
        text:
          'Somebody is in trouble: a swimmer far off a coast, or a walker stranded high on a hill. Reach a swimmer by boat, a walker by road, or either one by hovering low over them in a helicopter. Stop, press {use}, and bring them home to their town.',
        touch:
          'Somebody is in trouble: a swimmer far off a coast, or a walker stranded high on a hill. Reach a swimmer by boat, a walker by road, or either one by hovering low over them in a helicopter. Stop, tap the button, and bring them home.',
      },
      {
        heading: 'Par and medals',
        text:
          'Every job has a par time. Finish within par for gold, a little over for silver, and any finish at all still earns bronze. Rescues are worth the most and errands the least.',
      },
    ],
  },
  {
    id: 'reputation',
    title: 'Reputation',
    icon: 'star',
    role: 'dispatcher',
    summary: 'What your jobs earn you in each country, and the standings it brings.',
    pages: [
      {
        heading: 'Making a name',
        text:
          'Every job you finish earns reputation in the country it was offered in, and a better medal earns more: gold is worth twice bronze. Your reputation in each country is your own and stays with you.',
      },
      {
        heading: 'Standings',
        text:
          'Reputation lifts your standing in a country one step at a time: Stranger, Helping hand, Regular, Local favourite, Household name and, at last, Legend. When a job lifts you a step, the card says so as you finish.',
      },
      {
        heading: 'Your record',
        text: 'The Work pages of your passport count your jobs and your medals, and list your standing and your reputation in every country you have worked in.',
      },
    ],
  },
  {
    id: 'commissions',
    title: 'Daily commissions',
    icon: 'calendar',
    role: 'dispatcher',
    summary: 'A few small goals each day, the same for everybody.',
    pages: [
      {
        heading: 'Today’s commissions',
        text:
          'Each day the Dispatcher has a few commissions: small goals for that day, the same for every traveller in the world. A blue ! over the Dispatcher means today’s are still open. Tomorrow brings new ones.',
      },
      {
        heading: 'Doing them',
        text: 'Their progress shows in the Journal of your Field Guide and ticks along as you play. Each one you finish earns experience.',
      },
      {
        heading: 'Streaks',
        text:
          'Finish every commission on days in a row and you build a streak. Some of the Outfitter’s rewards are kept for travellers who keep a streak going, so it is worth coming back.',
      },
    ],
  },
  {
    id: 'landmark-rings',
    title: 'Landmark rings',
    icon: 'sparkle',
    role: 'marshal',
    summary: 'A gold ring high over every landmark, to collect.',
    pages: [
      {
        heading: 'A ring over every landmark',
        text: 'A gold ring hangs high over every landmark in the world, waiting to be collected. Go through it and it is yours, with a fanfare. The Rings pages of your passport keep count.',
      },
      {
        heading: 'Reaching them',
        text: 'The rings are far too high to jump for. Take a plane, a helicopter or a balloon, or jump out of one higher up and steer your parachute through.',
      },
      {
        heading: 'Rings off',
        text:
          'If you would rather just look at the world, Settings has a switch for rings and courses, under Graphics. Off, none of them show; everything you collected is kept for when they come back.',
      },
    ],
  },
  {
    id: 'courses',
    title: 'Ring courses',
    icon: 'flag',
    role: 'marshal',
    summary: 'Air, land and sea courses: where they are and how a run goes.',
    pages: [
      {
        heading: 'Three kinds',
        text:
          'A course is a run through a line of rings against the clock. Air courses loop round the capitals of the larger countries, for any aircraft. Land rallies run along the roads out of a capital, for anything on wheels or hooves. Sea courses loop off a port on each sea, for anything that floats.',
      },
      {
        heading: 'Finding one',
        text:
          'A course shows only when you come near it in the right kind of vehicle, and then only its green start ring. The world map marks every course on the planet, so you can plan a trip to one.',
      },
      {
        heading: 'The run',
        text:
          'Go through the green ring and the clock starts. The next ring beats so you can spot it, the one after waits beyond it, and the finish is chequered black and white. A loop can be run either way round.',
      },
      {
        heading: 'A helping hand',
        text: 'In a plane, let go of the keys and the plane eases itself towards the next ring. It is a nudge, not an autopilot: you still have to fly.',
      },
      {
        heading: 'Abandoned',
        text: 'Get out of your vehicle for more than a few seconds, or stray far from the next ring, and the run is abandoned. Head back to the start ring to try again.',
      },
    ],
  },
  {
    id: 'course-medals',
    title: 'Perfects, misses and medals',
    icon: 'trophy',
    role: 'marshal',
    summary: 'How a course run is timed and what a medal takes.',
    pages: [
      {
        heading: 'Perfects and misses',
        text: 'Go through the very middle of a ring for a perfect, and half a second comes off your time. Pass beside a ring and it is a miss, but the run carries on.',
      },
      {
        heading: 'Medals',
        text:
          'Every course has its own par time. Gold takes no misses and a time near par. Silver allows one miss and a little more time. Bronze needs at least half the rings. Miss more than half and there is no medal.',
      },
      {
        heading: 'Your best',
        text:
          'Your best time and medal on every course are kept on the Courses pages of your passport, and beating your best saves the new one. Gold medals count towards your milestones, and the Hall of Fame keeps the fastest times of all.',
      },
    ],
  },
];
