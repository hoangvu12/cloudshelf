/**
 * True when the keyboard event's target is a user-editable surface — an
 * <input>, <textarea>, or any element with contenteditable. Used to bail out
 * of global shortcuts so a literal keystroke (e.g. typing "?" into a field)
 * doesn't get hijacked.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
