import type { PresentationPath } from '@project/core';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';

export interface PathSelectorProps {
  paths: readonly PresentationPath[];
  selectedPathId: string | null;
  onSelect: (pathId: string) => void;
}

export function PathSelector({ paths, selectedPathId, onSelect }: PathSelectorProps) {
  return (
    <label className="path-selector">
      <span className="path-selector__label">Path</span>
      <Select value={selectedPathId ?? undefined} onValueChange={onSelect}>
        <SelectTrigger
          className="path-selector__select"
          data-testid="path-selector"
          aria-label="Path"
        >
          <SelectValue placeholder="Select a path…" />
        </SelectTrigger>
        <SelectContent>
          {paths.map((path) => (
            <SelectItem key={path.id} value={path.id}>
              {path.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
