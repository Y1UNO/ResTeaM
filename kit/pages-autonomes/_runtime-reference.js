/* ResTeaM — mini runtime autonome pour les maquettes .dc.html
   Remplace le runtime du canevas : interprète {{…}}, <sc-for>, <sc-if>, les événements onClick/onMouseEnter/…
   et la classe Component (state / setState / renderVals). Aucune dépendance. */
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(p) {
      const patch = typeof p === 'function' ? p(this.state, this.props) : p;
      this.state = Object.assign({}, this.state, patch);
      this.__schedule && this.__schedule();
    }
    forceUpdate() { this.__schedule && this.__schedule(); }
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const ONLY = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  const EVENTS = { onclick: 'click', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave', oninput: 'input', onchange: 'change', onmousemove: 'mousemove', onkeydown: 'keydown' };

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    let v = scope;
    for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
    return v;
  }
  const str = (v) => (v == null ? '' : String(v));
  const interp = (s, scope) => s.replace(HOLE, (_, p) => str(lookup(p, scope)));

  function build(node, scope, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'sc-for') {
      const m = (node.getAttribute('list') || '').match(ONLY);
      const list = m ? lookup(m[1], scope) : [];
      const as = node.getAttribute('as') || 'item';
      (list || []).forEach((item, i) => {
        const s = Object.create(scope); s[as] = item; s.$index = i;
        node.childNodes.forEach((c) => build(c, s, out));
      });
      return;
    }
    if (tag === 'sc-if') {
      const m = (node.getAttribute('value') || '').match(ONLY);
      if (m && lookup(m[1], scope)) node.childNodes.forEach((c) => build(c, scope, out));
      return;
    }
    if (tag === 'dc-import' || tag === 'helmet') return;
    const el = node.cloneNode(false);
    el.__h = {};
    for (const a of Array.from(node.attributes)) {
      const name = a.name;
      if (name.startsWith('hint-')) { el.removeAttribute(name); continue; }
      if (EVENTS[name]) {
        el.removeAttribute(name);
        const m = a.value.match(ONLY);
        const fn = m ? lookup(m[1], scope) : null;
        if (typeof fn === 'function') el.__h[EVENTS[name]] = fn;
        continue;
      }
      if (a.value.indexOf('{{') !== -1) {
        const m = a.value.match(ONLY);
        const v = m ? lookup(m[1], scope) : interp(a.value, scope);
        if (v === false || v == null) el.removeAttribute(name); else el.setAttribute(name, str(v));
      }
    }
    const kids = [];
    const src = node.localName === 'template' ? node.content : node;
    src.childNodes.forEach((c) => build(c, scope, kids));
    kids.forEach((k) => el.appendChild(k));
    out.push(el);
  }

  function bind(el) {
    if (el.nodeType !== 1 || el.__bound) return;
    el.__bound = true;
    ['click', 'mouseenter', 'mouseleave', 'input', 'change', 'mousemove', 'keydown'].forEach((t) => {
      el.addEventListener(t, (e) => { const f = el.__h && el.__h[t]; if (f) f(e); });
    });
  }
  function bindAll(el) { if (el.nodeType !== 1) return; bind(el); el.querySelectorAll('*').forEach(bind); }

  function morph(a, b) {
    if (a.nodeType !== b.nodeType || (a.nodeType === 1 && a.namespaceURI + a.localName !== b.namespaceURI + b.localName)) {
      bindAll(b); a.replaceWith(b); return;
    }
    if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    if (a.nodeType !== 1) return;
    for (const at of Array.from(a.attributes)) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    for (const at of Array.from(b.attributes)) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    a.__h = b.__h;
    if (a.localName === 'input' && document.activeElement !== a && b.hasAttribute('value')) a.value = b.getAttribute('value');
    morphChildren(a, b);
  }
  function morphChildren(a, b) {
    const ak = Array.from(a.childNodes), bk = Array.from(b.childNodes);
    for (let i = 0; i < bk.length; i++) {
      if (i < ak.length) morph(ak[i], bk[i]); else { bindAll(bk[i]); a.appendChild(bk[i]); }
    }
    for (let i = bk.length; i < ak.length; i++) ak[i].remove();
  }

  function boot() {
    const host = document.querySelector('x-dc');
    if (!host) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = host.innerHTML;
    host.innerHTML = '';
    host.style.display = 'block';
    const helmet = tpl.content.querySelector('helmet');
    if (helmet) { Array.from(helmet.childNodes).forEach((n) => document.head.appendChild(n.cloneNode(true))); helmet.remove(); }
    const script = document.querySelector('script[data-dc-script]');
    let props = {};
    try {
      const defs = JSON.parse(script.getAttribute('data-props') || '{}');
      Object.keys(defs).forEach((k) => { if (k[0] !== '$' && defs[k] && 'default' in defs[k]) props[k] = defs[k].default; });
    } catch (e) { console.warn('data-props', e); }
    const Component = new Function('DCLogic', script.textContent + '\nreturn Component;')(DCLogic);
    const comp = new Component(props);
    let queued = false;
    const render = () => {
      queued = false;
      const out = [];
      const vals = comp.renderVals();
      tpl.content.childNodes.forEach((c) => build(c, vals, out));
      const next = document.createElement('div');
      out.forEach((n) => next.appendChild(n));
      if (!host.__first) {
        host.__first = true;
        Array.from(next.childNodes).forEach((n) => { bindAll(n); host.appendChild(n); });
      } else {
        morphChildren(host, next);
      }
    };
    comp.__schedule = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };
    render();
    if (comp.componentDidMount) comp.componentDidMount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
