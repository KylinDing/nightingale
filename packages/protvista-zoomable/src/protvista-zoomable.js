import {
  scaleLinear,
  zoom as d3zoom,
  zoomIdentity,
  event as d3Event
} from "d3";
import { TrackHighlighter } from "protvista-utils";

import ResizeObserver from "resize-observer-polyfill";

class ProtvistaZoomable extends HTMLElement {
  constructor() {
    super();

    this._updateScaleDomain = this._updateScaleDomain.bind(this);
    this._initZoom = this._initZoom.bind(this);
    this.zoomed = this.zoomed.bind(this);
    this._applyZoomTranslation = this.applyZoomTranslation.bind(this);
    this._resetEventHandler = this._resetEventHandler.bind(this);
    // this.bindEvents = this.bindEvents(this);
    let aboutToApply = false;
    // Postponing the zoom translation to the next frame.
    // This helps in case several attributes are changed almost at the same time,
    // in this way, only one refresh will be called.
    this.applyZoomTranslation = () => {
      if (aboutToApply) return;
      aboutToApply = true;
      requestAnimationFrame(() => {
        aboutToApply = false;
        this._applyZoomTranslation();
      });
    };
    this._onResize = this._onResize.bind(this);
    this._listenForResize = this._listenForResize.bind(this);
    this.trackHighlighter = new TrackHighlighter({ element: this, min: 1 });
  }

  connectedCallback() {
    this.style.display = "block";
    this.style.width = "100%";
    this.width = this.offsetWidth;

    this._length = this.getAttribute("length")
      ? parseFloat(this.getAttribute("length"))
      : 0;

    this._displaystart = this.getAttribute("displaystart")
      ? parseFloat(this.getAttribute("displaystart"))
      : 1;
    this._displayend = this.getAttribute("displayend")
      ? parseFloat(this.getAttribute("displayend"))
      : this.width;

    this._height = this.getAttribute("height")
      ? parseInt(this.getAttribute("height"))
      : 44;
    this._highlightEvent = this.getAttribute("highlight-event")
      ? this.getAttribute("highlight-event")
      : "onclick";

    this.trackHighlighter.setAttributesInElement(this);

    this._updateScaleDomain();
    // The _originXScale is a way to mantain all the future transformations over the same original scale.
    // It only gets redefined if the size of the component, or the length of the sequence changes.
    this._originXScale = this.xScale.copy();
    this._initZoom();
    this._listenForResize();
    this.addEventListener("error", e => {
      throw e;
    });
    if (!window.hasProtvistaReset) {
      window.addEventListener("click", this._resetEventHandler);
      window.hasProtvistaReset = true;
    }
  }

  disconnectedCallback() {
    if (this._ro) {
      this._ro.unobserve(this);
    } else {
      window.removeEventListener("resize", this._onResize);
    }
    window.removeEventListener("click", this._resetEventHandler);
  }

  get width() {
    return this._width;
  }

  set width(width) {
    this._width = width;
  }

  set height(height) {
    this._height = height;
  }

  get height() {
    return this._height;
  }

  set length(length) {
    this._length = length;
    this.trackHighlighter.max = length;
  }

  get length() {
    return this._length;
  }

  get xScale() {
    return this._xScale;
  }

  set xScale(xScale) {
    this._xScale = xScale;
  }

  get zoom() {
    return this._zoom;
  }

  set svg(svg) {
    this._svg = svg;
    svg.call(this._zoom);
    this.applyZoomTranslation();
  }

  get svg() {
    return this._svg;
  }

  get isManaged() {
    return true;
  }

  get margin() {
    return {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10
    };
  }
  set fixedHighlight(region) {
    this.trackHighlighter.setFixedHighlight(region);
  }

  getWidthWithMargins() {
    return this.width ? this.width - this.margin.left - this.margin.right : 0;
  }

  _updateScaleDomain() {
    this.xScale = scaleLinear()
      // The max width should match the start of the n+1 base
      .domain([1, this._length + 1])
      .range([0, this.getWidthWithMargins()]);
  }

  _initZoom() {
    this._zoom = d3zoom()
      .scaleExtent([1, Infinity])
      .translateExtent([[0, 0], [this.getWidthWithMargins(), 0]])
      .on("zoom", this.zoomed);
  }

  static get observedAttributes() {
    return ["displaystart", "displayend", "length", "highlight"];
  }

  setFloatAttribute(name, strValue) {
    const value = parseFloat(strValue);
    this[`_${name}`] = isNaN(value) ? strValue : value;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (newValue === "null") newValue = null;
    if (oldValue !== newValue) {
      if (name.startsWith("highlight")) {
        this.trackHighlighter.changedCallBack(name, newValue);
        return;
      }
      this.setFloatAttribute(name, newValue);

      if (name === "length") {
        this._updateScaleDomain();
        this._originXScale = this.xScale.copy();
      }
      // One of the observable attributes changed, so the scale needs to be redefined.
      this.applyZoomTranslation();
    }
  }

  zoomed() {
    // Redefines the xScale using the original scale and transform it with the captured event data.
    this.xScale = d3Event.transform.rescaleX(this._originXScale);

    // If the source event is null the zoom wasn't initiated by this component, don't send event
    if (this.dontDispatch) return;
    let [start, end] = this.xScale.domain(); // New positions based in the updated scale
    end--; // the end coordinate is 1 less than the max domain
    this.dispatchEvent(
      // Dispatches the event so the manager can propagate this changes to other  components
      new CustomEvent("change", {
        detail: {
          displaystart: Math.max(1, start),
          displayend: Math.min(
            this.length,
            Math.max(end, start + 1) // To make sure it never zooms in deeper than showing 2 bases covering the full width
          )
        },
        bubbles: true,
        cancelable: true
      })
    );
  }

  applyZoomTranslation() {
    if (!this.svg || !this._originXScale) return;
    // Calculating the scale factor based in the current start/end coordinates and the length of the sequence.
    const k = Math.max(
      1,
      // +1 because the displayend base should be included
      this.length / (1 + this._displayend - this._displaystart)
    );
    // The deltaX gets calculated using the position of the first base to display in original scale
    const dx = -this._originXScale(this._displaystart);
    this.dontDispatch = true; // This is to avoid infinite loops
    this.svg.call(
      // We trigger a zoom action
      this.zoom.transform,
      zoomIdentity // Identity transformation
        .scale(k) // Scaled by our scaled factor
        .translate(dx, 0) // Translated by the delta
    );
    this.dontDispatch = false;
    this.refresh();
  }

  _onResize() {
    this.width = this.offsetWidth;
    this._updateScaleDomain();
    this._originXScale = this.xScale.copy();
    if (this.svg) this.svg.attr("width", this.width);
    this._zoom
      .scaleExtent([1, Infinity])
      .translateExtent([[0, 0], [this.getWidthWithMargins(), 0]]);

    this.applyZoomTranslation();
  }

  _listenForResize() {
    // TODO add sleep to make transition appear smoother. Could experiment with CSS3
    // transitions too
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(this);
  }

  _resetEventHandler(e) {
    if (!e.target.closest(".feature")) {
      this.dispatchEvent(this.createEvent("reset", null, true));
    }
  }

  getXFromSeqPosition(position) {
    return this.margin.left + this.xScale(position);
  }
  getSingleBaseWidth() {
    return this.xScale(2) - this.xScale(1);
  }

  _getClickCoords() {
    if (!d3Event) {
      return null;
    }
    // const boundingRect = this.querySelector("svg").getBoundingClientRect();
    // Note: it would be nice to also return the position of the bottom left of the feature
    return [d3Event.pageX, d3Event.pageY];
  }

  createEvent(type, feature = null, withHighlight = false, start, end, target) {
    const detail = {
      eventtype: type,
      coords: this._getClickCoords(),
      feature,
      target
    };
    if (withHighlight) {
      if (feature && feature.fragments) {
        detail.highlight = feature.fragments
          .map(fr => `${fr.start}:${fr.end}`)
          .join(",");
      } else {
        detail.highlight = start && end ? `${start}:${end}` : null;
      }
    }
    return new CustomEvent("change", {
      detail: detail,
      bubbles: true,
      cancelable: true
    });
  }

  bindEvents(feature, element) {
    feature
      .on("mouseover", (f, i, group) => {
        element.dispatchEvent(
          element.createEvent(
            "mouseover",
            f,
            element._highlightEvent === "onmouseover",
            f.start,
            f.end,
            group[i]
          )
        );
      })
      .on("mouseout", f => {
        element.dispatchEvent(
          element.createEvent(
            "mouseout",
            null,
            element._highlightEvent === "onmouseover"
          )
        );
      })
      .on("click", (f, i, group) => {
        element.dispatchEvent(
          element.createEvent(
            "click",
            f,
            element._highlightEvent === "onclick",
            f.start,
            f.end,
            group[i]
          )
        );
      });
  }
}

export default ProtvistaZoomable;
