/**
 * Base class for every overlay and control panel component.
 *
 * The overlay polls the API several times a second. If each poll replaced the
 * shadow DOM, every CSS animation would restart mid-flight and the overlay
 * would visibly stutter on air. So rendering is split in two:
 *
 *   template()  - the structure. Rebuilt only when renderKey() changes.
 *   update()    - the data. Runs on every state change and patches text,
 *                 attributes and classes in place.
 *
 * The patch helpers all no-op when the value is unchanged, so a poll that
 * brings identical data touches the DOM zero times and animations keep running.
 */
class BaseComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._state = {};
    this._eventListeners = [];
    this._built = false;
    this._lastRenderKey = null;
  }

  setState(newState) {
    const oldState = { ...this._state };
    this._state = { ...this._state, ...newState };
    this.onStateChange(oldState, this._state);
    this.render();
  }

  getState() {
    return { ...this._state };
  }

  onStateChange(oldState, newState) {}

  /** Structure of the component. Rebuilt only when renderKey() changes. */
  template() {
    return '';
  }

  /** Component-scoped CSS. Injected once. */
  styles() {
    return '';
  }

  /**
   * Identity of the current structure. When this changes the template is
   * rebuilt from scratch; when it stays the same only update() runs.
   *
   * Return something that captures "this is a different thing now" - a team id,
   * a row count - but not values that merely tick, like a clock.
   */
  renderKey() {
    return 'default';
  }

  /** Patch data into the existing DOM. Called after every state change. */
  update() {}

  render() {
    if (!this._built) {
      const style = document.createElement('style');
      style.textContent = this.styles();
      this._root = document.createElement('div');
      this._root.className = 'component-root';
      this.shadowRoot.append(style, this._root);
      this._built = true;
    }

    const key = this.renderKey();
    if (key !== this._lastRenderKey) {
      this._lastRenderKey = key;
      this.removeAllEventListeners();
      this._root.innerHTML = this.template();
      this.afterRender();
    }

    this.update();
  }

  /** Force the next render to rebuild the structure. */
  invalidate() {
    this._lastRenderKey = null;
  }

  afterRender() {}

  $(selector) {
    return this.shadowRoot.querySelector(selector);
  }

  $$(selector) {
    return this.shadowRoot.querySelectorAll(selector);
  }

  // --- Patch helpers: each writes only when the value actually differs ------

  setText(selector, value) {
    const el = typeof selector === 'string' ? this.$(selector) : selector;
    if (!el) return;
    const next = value == null ? '' : String(value);
    if (el.textContent !== next) el.textContent = next;
  }

  setAttr(selector, name, value) {
    const el = typeof selector === 'string' ? this.$(selector) : selector;
    if (!el) return;
    if (value == null || value === false) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
      return;
    }
    const next = value === true ? '' : String(value);
    if (el.getAttribute(name) !== next) el.setAttribute(name, next);
  }

  setClass(selector, className, enabled) {
    const el = typeof selector === 'string' ? this.$(selector) : selector;
    if (!el) return;
    if (el.classList.contains(className) !== !!enabled) {
      el.classList.toggle(className, !!enabled);
    }
  }

  setStyleVar(selector, name, value) {
    const el = typeof selector === 'string' ? this.$(selector) : selector;
    if (!el) return;
    if (el.style.getPropertyValue(name) !== String(value)) {
      el.style.setProperty(name, value);
    }
  }

  // --- Visibility ----------------------------------------------------------

  /**
   * Drive the enter/exit animation through a class on the host element, so the
   * exit transition can play out before anything is torn down.
   */
  setVisible(visible) {
    this.classList.toggle('is-visible', !!visible);
  }

  addManagedListener(element, event, handler) {
    element.addEventListener(event, handler);
    this._eventListeners.push({ element, event, handler });
  }

  removeAllEventListeners() {
    this._eventListeners.forEach(({ element, event, handler }) => {
      element.removeEventListener(event, handler);
    });
    this._eventListeners = [];
  }

  disconnectedCallback() {
    this.removeAllEventListeners();
  }

  emit(eventName, detail = {}) {
    this.dispatchEvent(new CustomEvent(eventName, {
      detail,
      bubbles: true,
      composed: true
    }));
  }

  // --- Formatting shared across components ---------------------------------

  static escape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Exported for components that import it directly (guarantees load order) and
// exposed globally for inline page scripts.
window.BaseComponent = BaseComponent;
export default BaseComponent;
export { BaseComponent };
