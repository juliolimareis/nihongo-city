// Navegadores de TV (webOS 6 = Chromium 79) ainda não têm replaceChildren.
if (!Element.prototype.replaceChildren) {
  Element.prototype.replaceChildren = function replaceChildren(this: Element, ...nodes: (Node | string)[]) {
    while (this.lastChild) this.removeChild(this.lastChild);
    this.append(...nodes);
  };
}

export {};
