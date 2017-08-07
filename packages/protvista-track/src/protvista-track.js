import * as d3 from "d3";
import _includes from 'lodash-es/includes';

const height = 40,
  width = 700,
  padding = {
    top: 10,
    right: 10,
    bottom: 10,
    left: 10
  };

class ProtVistaTrack extends HTMLElement {

  constructor() {
    super();
    this._length = parseInt(this.getAttribute('length'));
    this._displaystart = parseInt(this.getAttribute('displaystart')) || 1;
    this._displayend = parseInt(this.getAttribute('displayend')) || this._length;
    this._highlightstart = parseInt(this.getAttribute('highlightstart'));
    this._highlightend = parseInt(this.getAttribute('highlightend'));
    this._color = this.getAttribute('color');
  }

  connectedCallback() {
    if (this._data)
      this._createTrack();

    this.addEventListener('load', e => {
      if (_includes(this.children, e.target)) {
        this.data = e.detail.payload;
      }
    });
  }

  set data(data) {
    this._data = data;
    this._createTrack();
  }

  static get observedAttributes() {return [
    'length', 'displaystart', 'displayend', 'highlightstart', 'highlightend', 'color'
  ]; }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue){
      const intValue = parseInt(newValue);
      this[`_${name}`] = isNaN(intValue) ? newValue : intValue;
      this._updateTrack();
    }
  }

  _createTrack() {
    this._x = d3.scaleLinear()
      .range([padding.left, width - padding.right])
      .domain([this._displaystart, this._displayend]);

    const svg = d3.select(this)
      .append('div')
      .attr('class', '')
      .append('svg')
      .attr('id', '')
      .attr('width', width)
      .attr('height', (height));

    this.highlighted = svg.append('rect')
      .attr('class', 'highlighted')
      .attr('fill', 'yellow')
      .attr('height', height);

    this.seq_g = svg.append('g')
      .attr('class', 'sequence');

    this.features = this.seq_g.selectAll('rect.feature')
      .data(this._data);

    this.features.enter()
      .append('rect')
      .attr('class', 'feature')
      .attr('y', height/4)
      .attr('fill', f => f.color ? f.color : this._color ? this._color : 'black')
      .attr('stroke', f => f.color ? f.color : this._color ? this._color : 'black')
      .attr('height', height/2)
      .on('mouseover', f => {
        this.dispatchEvent(new CustomEvent("change", {
          detail: {value: f.end, type: 'highlightend'}, bubbles:true, cancelable: true
        }));
        this.dispatchEvent(new CustomEvent("change", {
          detail: {value: f.start, type: 'highlightstart'}, bubbles:true, cancelable: true
        }));
      })
      .on('mouseout', () => {
        this.dispatchEvent(new CustomEvent("change", {
          detail: {value: null, type: 'highlightend'}, bubbles:true, cancelable: true
        }));
        this.dispatchEvent(new CustomEvent("change", {
          detail: {value: null, type: 'highlightstart'}, bubbles:true, cancelable: true
        }));
      });
    this._updateTrack();
  }

  _updateTrack(){
    if (this._x) {
      this._x.domain([this._displaystart, this._displayend]);
      this.features = this.seq_g.selectAll('rect.feature')
        .data(this._data);

      this.features
        .attr('x', f => this._x(f.start))
        .attr('width', f => Math.abs(this._x(this._displaystart+
          Math.max(1, f.end-f.start)
        )));

      if (Number.isInteger(this._highlightstart) && Number.isInteger(this._highlightend)){
        this.highlighted
          .attr('x', this._x(this._highlightstart))
          .style('opacity', 0.3)
          .attr('width', this._x(this._displaystart +
            Math.max(1, this._highlightend - this._highlightstart)
          ));
      } else {
        this.highlighted.style('opacity', 0);
      }
    }
  }
}


export default ProtVistaTrack;