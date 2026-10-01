import type { Story } from '@ladle/react';
import { DeleteConfirmationFixture } from '../support/DeleteConfirmationFixture';
import '../support/inventory.css';

export default { title: 'Components/Delete Confirmation' };

/** Delete Map: the Map, its Graphs and their Edges go, and its Resources stay. */
export const Map: Story = () => <DeleteConfirmationFixture kind="map" />;

/** Delete Graph: named with the Map it is deleted from. */
export const Graph: Story = () => <DeleteConfirmationFixture kind="graph" />;

/** Delete Edge: named as its toolbar names it, by its two ends when it has no Title. */
export const Edge: Story = () => <DeleteConfirmationFixture kind="edge" />;

/** Delete from Space: the Maps that place the Resource and the Graphs holding its Edges. */
export const Resource: Story = () => <DeleteConfirmationFixture kind="resource" />;

/** Delete from Space for a Space Resource, whose deletion can reach the Space it references. */
export const SpaceResource: Story = () => <DeleteConfirmationFixture kind="spaceResource" />;
