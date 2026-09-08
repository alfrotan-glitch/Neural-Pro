export interface ShortcutAction {
  id: string;
  name: string;
  category: string;
  description: string;
  keys: string[]; // e.g. ["ctrl+b", "b"]
}

export const defaultKeymap: ShortcutAction[] = [
  // Global & File Operations
  {
    id: 'select_all',
    name: 'Select All',
    category: 'Global Shortcuts & Project Management',
    description: 'Selects all clips on all tracks of the timeline.',
    keys: ['ctrl+a']
  },
  {
    id: 'copy',
    name: 'Copy',
    category: 'Global Shortcuts & Project Management',
    description: 'Saves selected clip properties to the clipboard memory.',
    keys: ['ctrl+c']
  },
  {
    id: 'paste',
    name: 'Paste',
    category: 'Global Shortcuts & Project Management',
    description: 'Pastes clipboard clip at current Playhead time.',
    keys: ['ctrl+v']
  },
  {
    id: 'cut',
    name: 'Cut',
    category: 'Global Shortcuts & Project Management',
    description: 'Deletes the selected clip and saves it to clipboard.',
    keys: ['ctrl+x']
  },
  {
    id: 'save_project',
    name: 'Save Project',
    category: 'Global Shortcuts & Project Management',
    description: 'Saves the current timeline state as a project file.',
    keys: ['ctrl+s']
  },
  {
    id: 'undo',
    name: 'Undo',
    category: 'Global Shortcuts & Project Management',
    description: 'Reverts the last action on the timeline.',
    keys: ['ctrl+z']
  },
  {
    id: 'redo',
    name: 'Redo',
    category: 'Global Shortcuts & Project Management',
    description: 'Re-applies the last undone action.',
    keys: ['ctrl+y', 'ctrl+shift+z']
  },

  // Timeline Editing Actions
  {
    id: 'split',
    name: 'Split Clip',
    category: 'Timeline Editing Tools',
    description: 'Splits selected clip at current Playhead position.',
    keys: ['b', 'ctrl+b']
  },
  {
    id: 'delete',
    name: 'Delete',
    category: 'Timeline Editing Tools',
    description: 'Deletes selected clip, leaving an empty gap.',
    keys: ['delete', 'backspace']
  },
  {
    id: 'ripple_delete',
    name: 'Ripple Delete',
    category: 'Timeline Editing Tools',
    description: 'Deletes clip and pulls forward subsequent clips on the track.',
    keys: ['shift+delete', 'shift+backspace']
  },
  {
    id: 'tool_retiming',
    name: 'Retiming Tool',
    category: 'Timeline Editing Tools',
    description: 'Enables rate-stretch to speed up or slow down clips.',
    keys: ['r']
  },
  {
    id: 'tool_selection',
    name: 'Selection Tool',
    category: 'Timeline Editing Tools',
    description: 'Reverts cursor to default selection and move mode.',
    keys: ['v']
  },

  // Playback & Navigation
  {
    id: 'play_pause',
    name: 'Play / Pause',
    category: 'Playback & Navigation',
    description: 'Toggles play/pause of timeline playhead.',
    keys: ['space']
  },
  {
    id: 'frame_forward',
    name: '1 Frame Forward',
    category: 'Playback & Navigation',
    description: 'Moves playhead 1 frame forward.',
    keys: ['arrowright']
  },
  {
    id: 'frame_backward',
    name: '1 Frame Backward',
    category: 'Playback & Navigation',
    description: 'Moves playhead 1 frame backward.',
    keys: ['arrowleft']
  },
  {
    id: 'ten_frames_forward',
    name: '10 Frames Forward',
    category: 'Playback & Navigation',
    description: 'Moves playhead 10 frames forward.',
    keys: ['shift+arrowright']
  },
  {
    id: 'ten_frames_backward',
    name: '10 Frames Backward',
    category: 'Playback & Navigation',
    description: 'Moves playhead 10 frames backward.',
    keys: ['shift+arrowleft']
  },
  {
    id: 'jump_prev_cut',
    name: 'Jump Prev Cut',
    category: 'Playback & Navigation',
    description: 'Jumps playhead to previous cut/transition point.',
    keys: ['arrowup']
  },
  {
    id: 'jump_next_cut',
    name: 'Jump Next Cut',
    category: 'Playback & Navigation',
    description: 'Jumps playhead to next cut/transition point.',
    keys: ['arrowdown']
  },
  {
    id: 'set_in_point',
    name: 'Mark In',
    category: 'Playback & Navigation',
    description: 'Sets the start boundary of working region.',
    keys: ['i']
  },
  {
    id: 'set_out_point',
    name: 'Mark Out',
    category: 'Playback & Navigation',
    description: 'Sets the end boundary of working region.',
    keys: ['o']
  },

  // Zoom & View
  {
    id: 'zoom_in',
    name: 'Zoom In',
    category: 'Timeline Zoom & View',
    description: 'Horizontally stretches the timeline zoom level.',
    keys: ['ctrl++', 'ctrl+=']
  },
  {
    id: 'zoom_out',
    name: 'Zoom Out',
    category: 'Timeline Zoom & View',
    description: 'Horizontally shrinks the timeline zoom level.',
    keys: ['ctrl+-']
  },
  {
    id: 'zoom_fit',
    name: 'Fit Timeline',
    category: 'Timeline Zoom & View',
    description: 'Fits all active clips into current window width.',
    keys: ['shift+z']
  }
];

/**
 * Normalizes a KeyboardEvent into a lowercase hotkey combination string
 * e.g., "ctrl+b", "shift+delete", "space", "arrowright"
 */
export function getEventHotkeyString(e: KeyboardEvent): string {
  const parts: string[] = [];
  
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  
  let key = e.key ? e.key.toLowerCase() : '';
  
  // Layout-agnostic physical key mapping (crucial for Persian/non-English layouts)
  if (e.code) {
    if (e.code.startsWith('Key')) {
      key = e.code.slice(3).toLowerCase();
    } else if (e.code.startsWith('Digit')) {
      key = e.code.slice(5);
    } else if (e.code === 'Space') {
      key = 'space';
    } else if (e.code === 'ArrowRight') {
      key = 'arrowright';
    } else if (e.code === 'ArrowLeft') {
      key = 'arrowleft';
    } else if (e.code === 'ArrowUp') {
      key = 'arrowup';
    } else if (e.code === 'ArrowDown') {
      key = 'arrowdown';
    } else if (e.code === 'Delete') {
      key = 'delete';
    } else if (e.code === 'Backspace') {
      key = 'backspace';
    } else if (e.code === 'Minus') {
      key = '-';
    } else if (e.code === 'Equal') {
      key = '=';
    }
  } else {
    // Fallback if e.code is not present
    if (key === ' ') {
      key = 'space';
    } else if (key === '+') {
      key = '+';
    } else if (key === '=') {
      key = '=';
    }
  }
  
  parts.push(key);
  
  return parts.join('+');
}

/**
 * Checks if an action corresponds to the current KeyboardEvent
 */
export function isActionMatched(action: ShortcutAction, e: KeyboardEvent): boolean {
  const hotkeyStr = getEventHotkeyString(e);
  
  return action.keys.some(k => {
    const normKey = k.toLowerCase().trim();
    // Handle special cases where ctrl++ or ctrl+= are configured
    if (normKey === 'ctrl+=' && hotkeyStr === 'ctrl+=') return true;
    if (normKey === 'ctrl++' && (hotkeyStr === 'ctrl++' || hotkeyStr === 'ctrl+=')) return true;
    return normKey === hotkeyStr;
  });
}
