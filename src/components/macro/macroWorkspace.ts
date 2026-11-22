import {
  MACRO_DRAFT_KEY,
  loadMacroLibrary,
  validateMacro,
  type MacroDefinition
} from '../../state/macros';

export function loadWorkspace() {
  let macros: MacroDefinition[] = [];
  let draft: MacroDefinition | null = null;
  let error = '';
  try {
    macros = loadMacroLibrary();
  } catch {
    error =
      'The saved macro library could not be read. Export or recover your existing data before replacing it.';
  }
  try {
    const stored = localStorage.getItem(MACRO_DRAFT_KEY);
    if (stored) {
      draft = JSON.parse(stored);
      validateMacro(draft, false);
    }
  } catch {
    draft = null;
  }
  return {
    macros,
    draft,
    error
  };
}
