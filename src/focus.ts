// Moving the focus on the Deck means moving Steam's gamepad selection, not just the browser focus.
// While Steam's window isn't focused as far as the browser knows (it happens after a client restart),
// element.focus() moves only the browser focus: the selection stays put and the two drift apart.
// Steam's own navigation tree is the source of truth, so ask it first.
declare const FocusNavController: any;

const APPLICATION = 2; // EFocusSource.APPLICATION

function findNode(node: any, el: Element, depth = 0): any {
  if (!node || depth > 64) return null;
  if (node.m_element === el) return node;
  for (const child of node.m_rgChildren ?? []) {
    const hit = findNode(child, el, depth + 1);
    if (hit) return hit;
  }
  return null;
}

// Selects `el` in Steam's navigation tree; false when it is not in it.
function takeFocus(el: Element): boolean {
  try {
    const ctx = FocusNavController?.m_ActiveContext ?? FocusNavController?.m_LastActiveContext;
    for (const tree of ctx?.m_rgGamepadNavigationTrees ?? []) {
      const node = findNode(tree.m_Root, el);
      if (node) {
        node.BTakeFocus(APPLICATION);
        return true;
      }
    }
  } catch {
    /* not reachable: the caller decides */
  }
  return false;
}

export function navFocus(el: Element | null | undefined): void {
  if (!el || takeFocus(el)) return;
  (el as HTMLElement).focus?.({ preventScroll: true });
}

// The mouse on a desktop. Steam moves its selection only with a gamepad or the keyboard, and while
// the mouse is the input it draws no selection at all: the pointer moves and nothing follows it.
// Within `root`, hovering anything Steam can select selects it (so the gamepad or the keyboard go on
// from there) and marks it the way Steam marks a selection, so the same looks apply. Clicking needs
// nothing: Steam already turns a click on a selectable into its A action.
// Only real pointer moves count: a row scrolling under a still pointer must not take the selection.
const SELECTED = "gpfocus";
let mouseFocusAt = 0;
// Whether the selection last moved because of the pointer: such a move must not scroll the row, or
// the cover would slide out from under the pointer.
export const focusedByMouse = () => performance.now() - mouseFocusAt < 150;

export function followMouse(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  let marked: HTMLElement | null = null;
  let x = -1;
  let y = -1;
  const onMove = (e: MouseEvent) => {
    if (e.screenX === x && e.screenY === y) return;
    x = e.screenX;
    y = e.screenY;
    const hit = (e.target as Element | null)?.closest?.<HTMLElement>("[tabindex]");
    if (!hit || hit === marked || !root.contains(hit)) return;
    mouseFocusAt = performance.now();
    if (!takeFocus(hit)) return;
    // Steam unmarks what it selected itself when its selection moves on; this one is ours to unmark.
    if (marked && marked !== hit) marked.classList.remove(SELECTED);
    hit.classList.add(SELECTED);
    marked = hit;
  };
  // A gamepad or key press moves the selection Steam's way, which unmarks the old one itself; ours
  // is forgotten so the next hover marks again.
  const onKey = () => {
    marked = null;
  };
  doc.addEventListener("mousemove", onMove, { passive: true });
  doc.addEventListener("keydown", onKey, true);
  let sub: any;
  try {
    sub = FocusNavController.m_navigationSource.Subscribe((v: any) => v?.eActivationSourceType !== MOUSE && onKey());
  } catch {
    /* no source to follow: hovering still works */
  }
  return () => {
    doc.removeEventListener("mousemove", onMove);
    doc.removeEventListener("keydown", onKey, true);
    sub?.Unsubscribe?.();
  };
}
const MOUSE = 3;

// Right after Steam starts nothing shows as selected until the first press: after a client restart
// no navigation context is active (the footer keeps Steam's defaults), and after the Deck boots the
// last input counts as touch, which hides the focus. On that press Steam wakes a context and switches
// the input source to the gamepad; do both the same way. Returns whether a context is active.
export function wakeNavigation(): boolean {
  try {
    if (!FocusNavController.NavigationSourceSupportsFocus?.Value)
      FocusNavController.UpdateSourceToGamepad(true);
    if (FocusNavController.m_ActiveContext) return true;
    return !!FocusNavController.FindAnActiveContext();
  } catch {
    return false;
  }
}
