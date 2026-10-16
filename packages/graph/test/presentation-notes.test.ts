import { describe, expect, it } from 'vitest';
import type { Graph, Map, ResourceId } from '@project/core';
import { presentationNotes } from '../src/index';
import { uuid } from './resource-files';

const id = (n: number): ResourceId =>
  uuid(`00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`);

const slide = id(1);
const next = id(2);
const firstNote = id(10);
const secondNote = id(11);
const thirdNote = id(12);

let graphCount = 100;
const graph = (
  title: string,
  edges: readonly (readonly [ResourceId, ResourceId])[] = [],
): Graph => ({
  id: id(graphCount++),
  title,
  edges: edges.map(([from, to]) => ({ from, to })),
});

const talk = graph('Intro Talk', [[slide, next]]);

/** A Map holding the talk and the given Graphs, in that order, every Resource placed. */
const mapOf = (
  graphs: readonly Graph[],
  positions: Readonly<Record<string, { x: number; y: number }>> = {},
): Map => ({
  id: id(900),
  title: 'Map',
  kind: 'positioned',
  positions: {
    [slide]: { x: 0, y: 0 },
    [next]: { x: 400, y: 0 },
    [firstNote]: { x: 0, y: 200 },
    [secondNote]: { x: 0, y: 400 },
    [thirdNote]: { x: 0, y: 600 },
    ...positions,
  },
  graphs: [talk, ...graphs],
});

const notesGraph = (title: string): Graph => graph(title, [[slide, firstNote]]);

/** The title of the Graph chosen as the talk's notes, or null for none. */
const chosen = (titles: readonly string[]): string | null =>
  presentationNotes(mapOf(titles.map(notesGraph)), talk, slide).graph?.title ?? null;

describe('presentationNotes: which Graph holds the notes', () => {
  it.each([
    'Intro Talk Presentation Notes',
    'Intro Talk Notes',
    'Intro Talk Presentation Script',
    'Intro Talk PresentationNotes',
    'intro talk presentation notes',
    'INTRO TALK — PRESENTATION NOTES',
    'intro-talk presentation_notes',
    'Intro Talk (Presentation Notes)',
    'Intro Talk: Notes',
    'Intro Talk\nPresentation Notes',
    'Ｉｎｔｒｏ Talk Notes',
    'Presentation Notes',
    'Notes',
    'Presentation Script',
    'presentation-cues',
  ])('accepts %j', (title) => {
    expect(chosen([title])).toBe(title);
  });

  it.each([
    'Intro Talk',
    'Intro Talk Presentations',
    'Intro Talk Notebook',
    'Intro Talk Presentation',
    'Presentation',
    'Intro Notes',
    'Talk Notes',
    'Notes Intro Talk',
    'Release Notes',
    'Speaker Notes',
  ])('rejects %j', (title) => {
    expect(chosen([title])).toBeNull();
  });

  it('finds none on a Map holding no other Graph', () => {
    expect(presentationNotes(mapOf([]), talk, slide)).toEqual({
      graph: null,
      passedOver: [],
      notes: [],
    });
  });

  it('never takes the presented Graph as its own notes', () => {
    const notes = graph('Notes', [[slide, firstNote]]);
    expect(presentationNotes(mapOf([]), notes, slide).graph).toBeNull();
  });

  it('prefers a Graph naming the talk to a bare one, wherever each sits', () => {
    expect(chosen(['Presentation Notes', 'Intro Talk Presentation Script'])).toBe(
      'Intro Talk Presentation Script',
    );
  });

  it('prefers "Presentation Notes" to "Notes", and "Notes" to "Presentation" and more', () => {
    expect(chosen(['Intro Talk Presentation Script', 'Intro Talk Notes'])).toBe('Intro Talk Notes');
    expect(chosen(['Intro Talk Notes', 'Intro Talk Presentation Notes'])).toBe(
      'Intro Talk Presentation Notes',
    );
    expect(chosen(['Presentation Script', 'Notes'])).toBe('Notes');
  });

  it('breaks a remaining tie by the Map’s Graph order', () => {
    expect(chosen(['Intro Talk Notes', 'intro talk: notes'])).toBe('Intro Talk Notes');
  });

  it('names every other matching Graph as passed over, in the order it ranked them', () => {
    const named = notesGraph('Intro Talk Notes');
    const bare = notesGraph('Notes');
    const unrelated = notesGraph('Backup');
    const script = notesGraph('Intro Talk Presentation Script');
    const result = presentationNotes(mapOf([bare, unrelated, script, named]), talk, slide);
    expect(result.graph).toBe(named);
    expect(result.passedOver).toEqual([script, bare]);
  });
});

describe('presentationNotes: the notes for a Resource', () => {
  it('answers the Resources the presented Resource reaches in the notes Graph', () => {
    const notes = graph('Notes', [
      [slide, firstNote],
      [next, secondNote],
    ]);
    expect(presentationNotes(mapOf([notes]), talk, slide).notes).toEqual([firstNote]);
    expect(presentationNotes(mapOf([notes]), talk, next).notes).toEqual([secondNote]);
  });

  it('answers none for a Resource the notes Graph does not leave', () => {
    const notes = graph('Notes', [[next, secondNote]]);
    const result = presentationNotes(mapOf([notes]), talk, slide);
    expect(result.graph).toBe(notes);
    expect(result.notes).toEqual([]);
  });

  it('orders several notes by where they sit on the Map, top to bottom then left to right', () => {
    const notes = graph('Notes', [
      [slide, thirdNote],
      [slide, firstNote],
      [slide, secondNote],
    ]);
    const map = mapOf([notes], {
      [firstNote]: { x: 300, y: 200 },
      [secondNote]: { x: 100, y: 200 },
      [thirdNote]: { x: 0, y: 100 },
    });
    expect(presentationNotes(map, talk, slide).notes).toEqual([thirdNote, secondNote, firstNote]);
  });
});
