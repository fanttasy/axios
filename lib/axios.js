'use strict';

import utils from './utils.js';
import bind from './helpers/bind.js';
import Axios from './core/Axios.js';
import mergeConfig from './core/mergeConfig.js';
import defaults from './defaults/index.js';
import formDataToJSON from './helpers/formDataToJSON.js';
import CanceledError from './cancel/CanceledError.js';
import CancelToken from './cancel/CancelToken.js';
import isCancel from './cancel/isCancel.js';
import {VERSION} from './env/data.js';
import toFormData from './helpers/toFormData.js';
import AxiosError from './core/AxiosError.js';
import spread from './helpers/spread.js';
import isAxiosError from './helpers/isAxiosError.js';
import AxiosHeaders from "./core/AxiosHeaders.js";
import HttpStatusCode from './helpers/HttpStatusCode.js';

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 *
 * @returns {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  // 创建Axios实例，传入默认配置
  const context = new Axios(defaultConfig);
  // 返回一个函数：调用将调用Axios.prototype.request并将this绑定到context（实例）
  const instance = bind(Axios.prototype.request, context);

  // 将Axios原型上的方法复制到函数对象,原型上有请求方法,因此调用时可以用(axios.get)等
  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context, {allOwnKeys: true});
  
  // 将Axios类实例上的方法复制到函数对象
  // Copy context to instance
  utils.extend(instance, context, null, {allOwnKeys: true});
  
  // 提供一个工厂方法create,用于创建一个新的实例
  // Factory for creating new instances
  instance.create = function create(instanceConfig) {
    // mergerConfig用于合并默认配置与实例自定义配置
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };

  return instance;
}

// Create the default instance to be exported
const axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Expose Cancel & CancelToken
axios.CanceledError = CanceledError;
axios.CancelToken = CancelToken;
axios.isCancel = isCancel;
axios.VERSION = VERSION;
axios.toFormData = toFormData;

// Expose AxiosError class
axios.AxiosError = AxiosError;

// alias for CanceledError for backward compatibility
axios.Cancel = axios.CanceledError;

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};

axios.spread = spread;

// Expose isAxiosError
axios.isAxiosError = isAxiosError;

// Expose mergeConfig
axios.mergeConfig = mergeConfig;

axios.AxiosHeaders = AxiosHeaders;

axios.formToJSON = thing => formDataToJSON(utils.isHTMLForm(thing) ? new FormData(thing) : thing);

axios.HttpStatusCode = HttpStatusCode;

axios.default = axios;

// this module should only have a default export
export default axios
