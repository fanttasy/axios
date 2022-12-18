'use strict';

export default function bind(fn, thisArg) {
  // 返回一个函数，利用闭包的特性，每次调用此函数时都是调用参数fn（即Axios.prototype.request），并正确绑定this
  return function wrap() {
    return fn.apply(thisArg, arguments);
  };
}
