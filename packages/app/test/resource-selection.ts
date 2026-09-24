import { fireEvent, screen, waitFor } from '@testing-library/react';

/**
 * Select a Resource on the canvas the way a pointer does, so its commands are drawn.
 *
 * A Resource's commands float in React Flow's `NodeToolbar`, which draws them while
 * that Resource is the one selected (`ResourceNode`). A click on the React Flow node
 * wrapper is React Flow's own selection gesture; the wrapper is the element React
 * Flow renders around the Resource, found from the Resource's article by its name.
 */
export async function selectResource(name: string): Promise<HTMLElement> {
  const article = await screen.findByRole('article', { name });
  const node = article.closest<HTMLElement>('.react-flow__node');
  if (node === null) throw new Error(`Resource ${name} is not drawn in a React Flow node`);
  return select(node);
}

/**
 * Select a Resource by its placement id, for when its name does not pick out one
 * Resource — a Reference Resource carries its Target's name.
 */
export async function selectResourceById(id: string): Promise<HTMLElement> {
  const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`);
  if (node === null) throw new Error(`Resource ${id} is not drawn in a React Flow node`);
  return select(node);
}

async function select(node: HTMLElement): Promise<HTMLElement> {
  fireEvent.click(node);
  await waitFor(() => expect(node).toHaveClass('selected'));
  return node;
}
