import { CardKinds, CardStates, Handles, RailActions, TitleEditing, Tweak } from './canvas.stories';

export default { title: 'Cards' };

export const States = CardStates;
export const Kinds = CardKinds;
export const CardHandles = Handles;
export const Actions = RailActions;
export const Editing = TitleEditing;
export const Playground = Tweak;

CardHandles.storyName = 'Handles';
Actions.storyName = 'Hover actions';
Editing.storyName = 'Editing';
Playground.storyName = 'Playground';
