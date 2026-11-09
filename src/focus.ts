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

export function navFocus(el: Element | null | undefined): void {
  if (!el) return;
  try {
    const ctx = FocusNavController?.m_ActiveContext ?? FocusNavController?.m_LastActiveContext;
    for (const tree of ctx?.m_rgGamepadNavigationTrees ?? []) {
      const node = findNode(tree.m_Root, el);
      if (node) return node.BTakeFocus(APPLICATION);
    }
  } catch {
    /* fall back to the browser focus */
  }
  (el as HTMLElement).focus?.({ preventScroll: true });
}

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
