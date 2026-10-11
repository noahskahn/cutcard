// Declarative form fields bound to app.cfg paths.
import { h, getPath, setPath } from './dom.js';

export function makeField(app, spec) {
  const { path, label, hint, type = 'number' } = spec;
  let input, setter;
  const cur = () => getPath(app.cfg, path);
  const commit = (v) => { setPath(app.cfg, path, v); app.change(path); };
  if (type === 'bool') {
    input = h('input', { type: 'checkbox' });
    input.addEventListener('change', () => commit(input.checked));
    setter = (v) => { input.checked = !!v; };
    var control = h('label', { class: 'switch' }, input, h('span'));
  } else if (type === 'select') {
    input = h('select', {}, spec.options.map(([v, l]) => h('option', { value: String(v) }, l)));
    input.addEventListener('change', () => {
      const raw = input.value; const o = spec.options.find(([v]) => String(v) === raw);
      commit(o ? o[0] : raw);
    });
    setter = (v) => { input.value = String(v); };
    control = input;
  } else {
    const scale = spec.scale || 1;
    input = h('input', { type: 'number', min: spec.min, max: spec.max, step: spec.step || 1, placeholder: spec.placeholder });
    input.addEventListener('change', () => {
      if (input.value === '' && spec.nullable) return commit(null);
      let v = parseFloat(input.value);
      if (!isFinite(v)) { setter(cur()); return; }
      if (spec.min != null) v = Math.max(spec.min, v);
      if (spec.max != null) v = Math.min(spec.max, v);
      commit(+(v / scale).toPrecision(10));
    });
    setter = (v) => { input.value = v == null ? '' : +(v * scale).toPrecision(10); };
    control = input;
  }
  const el = h('div', { class: 'field' }, h('label', { title: spec.hint || '' }, label), control, hint ? h('div', { class: 'hint' }, hint) : null);
  const reg = { path, set: () => { setter(cur()); if (spec.disabledIf) input.disabled = !!spec.disabledIf(app.cfg); if (spec.showIf) el.style.display = spec.showIf(app.cfg) ? '' : 'none'; } };
  app.fields.push(reg);
  reg.set();
  return el;
}

export function card(title, sub, ...body) {
  return h('div', { class: 'card' }, h('h3', {}, title), sub ? h('p', { class: 'sub' }, sub) : null, ...body);
}
