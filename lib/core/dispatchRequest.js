'use strict';

import transformData from './transformData.js';
import isCancel from '../cancel/isCancel.js';
import defaults from '../defaults/index.js';
import CanceledError from '../cancel/CanceledError.js';
import AxiosHeaders from '../core/AxiosHeaders.js';
import adapters from "../adapters/adapters.js";

/**
 * Throws a `CanceledError` if cancellation has been requested.
 *
 * @param {Object} config The config that is to be used for the request
 *
 * @returns {void}
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }

  if (config.signal && config.signal.aborted) {
    throw new CanceledError(null, config);
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 *
 * @returns {Promise} The Promise to be fulfilled
 */
export default function dispatchRequest(config) {
  // 取消请求
  throwIfCancellationRequested(config);

  // 处理请求头
  config.headers = AxiosHeaders.from(config.headers);

  // 转换数据
  // Transform request data
  config.data = transformData.call(
    config,
    config.transformRequest
  );

  // 对于带body的请求方法,设置请求头
  if (['post', 'put', 'patch'].indexOf(config.method) !== -1) {
    config.headers.setContentType('application/x-www-form-urlencoded', false);
  }

  // 获取适配器,判断请求发送方法(xhr/http)
  const adapter = adapters.getAdapter(config.adapter || defaults.adapter);

  // 发生请求
  return adapter(config).then(function onAdapterResolution(response) {
    // 取消请求
    throwIfCancellationRequested(config);

    // 数据转换
    // Transform response data
    response.data = transformData.call(
      config,
      config.transformResponse,
      response
    );

    response.headers = AxiosHeaders.from(response.headers);
    // 返回成功结果
    return response;
  }, function onAdapterRejection(reason) {
    // 请求失败,判断是否取消请求
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData.call(
          config,
          config.transformResponse,
          reason.response
        );
        reason.response.headers = AxiosHeaders.from(reason.response.headers);
      }
    }
    // 返回失败结果(原因)
    return Promise.reject(reason);
  });
}
