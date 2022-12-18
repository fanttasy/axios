# <center>Axios源码分析</center>

### 1.定义
  > Promise based HTTP client for the browser and node.js（简单来说：基于Promise封装，用于浏览器和nodejs发送HTTP请求）

### 2. 主要特性
  - 支持浏览器和nodejs
  - 基于Promise
  - 请求、响应拦截器和转换请求和响应数据
  - 可取消请求
  - 自动转换JSON数据
  - 自动将数据对象序列化为multipart/form-data和x-www-form-urlencoded主体编码
  - 客户端支持防范 XSRF

### 3. 源码分析
  #### 3.1 目录结构
    |-- lib
        |-- adapters // HTTP请求适配器,浏览器使用XMLHttpRequest,nodejs使用http库
            |-- adapters.js // 获取当前环境使用的方法
            |-- xhr.js
            |-- http.js
        |-- cancel // 取消请求功能实现
        |-- core
            |-- Axios.js // Axios类
            |-- AxiosError.js // Axios错误类定义
            |-- AxiosHeaders.js // 处理HTTP请求头
            |-- buildFullPath.js // 实现构造完整请求路径
            |-- dispatchRequest.js // 调用HTTP请求适配器方法发送请求
            |-- InterceptorManager.js // 拦截器管理器
            |-- mergeConfig.js // 合并配置参数
            |-- settle.js // HTTP状态码管理,自定义不同状态码下Promise返回的状态
            |-- transformData.js // 转换数据格式
        |-- defaults // 默认配置
        |-- helpers // 辅助方法
        |-- env // 环境信息
        |-- platform // 处理不同平台
        |-- axios.js // axios对象创建及暴露
        |-- utils.js // 公用函数

  #### 3.2 执行流程
  - createInstance: 创建axios实例
      ```JavaScript
      function createInstance(defaultConfig) {
        // 创建Axios实例，传入默认配置
        const context = new Axios(defaultConfig);
        // 返回一个函数：调用将调用Axios.prototype.request并将this绑定到context（实例）
        const instance = bind(Axios.prototype.request, context);

        // 将Axios原型上的方法复制到函数对象,原型上有请求方法,因此调用时可以用(axios.get)等
        utils.extend(instance, Axios.prototype, context, {allOwnKeys: true});
        
        // 将Axios类实例上的方法复制到函数对象
        utils.extend(instance, context, null, {allOwnKeys: true});
        
        // 提供一个工厂方法create,用于创建一个新的实例
        instance.create = function create(instanceConfig) {
          // mergerConfig用于合并默认配置与实例自定义配置
          return createInstance(mergeConfig(defaultConfig, instanceConfig));
        };

        return instance;
      }
      ```
      简单来说就是创建了一个函数对象,并将Axios.prototype,Axios实例方法复制到此函数对象上,使得我们可以调用```axios()```,也可以调用```axios.get()```等

  - Axios.prototype.request: 核心代码请求流程及配置下发
    ```JavaScript
    request(configOrUrl, config) {
      // 如果使用axios(url: string)方式调用,将参数转化为{url: ***}格式
      if (typeof configOrUrl === 'string') {
        config = config || {};
        config.url = configOrUrl;
      } else {
        config = configOrUrl || {};
      }

      // 合并默认配置参数与自定义配置参数
      config = mergeConfig(this.defaults, config);

      const {transitional, paramsSerializer, headers} = config;

      // 确定请求方法
      config.method = (config.method || this.defaults.method || 'get').toLowerCase();

      // 处理请求头
      let contextHeaders;

      contextHeaders = headers && utils.merge(
        headers.common,
        headers[config.method]
      );

      contextHeaders && utils.forEach(
        ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
        (method) => {
          delete headers[method];
        }
      );

      config.headers = AxiosHeaders.concat(contextHeaders, headers);

      // 将请求响应拦截器合并到数组头,请求拦截器runWhen函数来判断是否执行
      const requestInterceptorChain = [];
      let synchronousRequestInterceptors = true;
      this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
        if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
          return;
        }

        synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;

        requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
      });

      // 将所有响应拦截器合并到数组尾
      const responseInterceptorChain = [];
      this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
        responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      });

      let promise;
      let i = 0;
      let len;

      // 异步请求(默认配置)
      if (!synchronousRequestInterceptors) {
        // 将请求拦截器,请求发送,响应拦截器存入一个promist调用链
        // 顺序为[request2, request1, http, undefined, response1, response2]
        // dispatchRequest用于发生请求,undefined在这里为补位作用,因为每次都是取出两个回调函数,如果没有undefined补位调用顺序会出错
        const chain = [dispatchRequest.bind(this), undefined];
        chain.unshift.apply(chain, requestInterceptorChain);
        chain.push.apply(chain, responseInterceptorChain);
        len = chain.length;

        promise = Promise.resolve(config);

        // 执行调用链
        while (i < len) {
          promise = promise.then(chain[i++], chain[i++]);
        }

        // 返回执行结果
        return promise;
      }

      // 如果是同步请求则走以下流程,与上面执行流程一致,只是同步执行
      len = requestInterceptorChain.length;

      let newConfig = config;

      i = 0;

      while (i < len) {
        const onFulfilled = requestInterceptorChain[i++];
        const onRejected = requestInterceptorChain[i++];
        try {
          newConfig = onFulfilled(newConfig);
        } catch (error) {
          onRejected.call(this, error);
          break;
        }
      }

      try {
        promise = dispatchRequest.call(this, newConfig);
      } catch (error) {
        return Promise.reject(error);
      }

      i = 0;
      len = responseInterceptorChain.length;

      while (i < len) {
        promise = promise.then(responseInterceptorChain[i++], responseInterceptorChain[i++]);
      }

      return promise;
    }
    ```
    主要包含了执行流程,对配置的一些处理,以及请求拦截器,响应拦截器和实际请求的执行和执行顺序处理

  - dispatchRequest
    ```JavaScript
    function dispatchRequest(config) {
      // 取消请求
      throwIfCancellationRequested(config);

      // 处理请求头
      config.headers = AxiosHeaders.from(config.headers);

      // 转换数据
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

          // 数据转换
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
    ```

  - 发送请求(XMLHttpRequest为例)
    ```JavaScript
    function (config) {
      return new Promise(function dispatchXhrRequest(resolve, reject) {
        let requestData = config.data;
        const requestHeaders = AxiosHeaders.from(config.headers).normalize();
        const responseType = config.responseType;
        let onCanceled;

        // 请求完成,解除取消请求操作
        function done() {
          if (config.cancelToken) {
            config.cancelToken.unsubscribe(onCanceled);
          }

          if (config.signal) {
            config.signal.removeEventListener('abort', onCanceled);
          }
        }

        if (utils.isFormData(requestData) && (platform.isStandardBrowserEnv || platform.isStandardBrowserWebWorkerEnv)) {
          requestHeaders.setContentType(false); // Let the browser set it
        }

        let request = new XMLHttpRequest();

        // HTTP认证参数
        if (config.auth) {
          const username = config.auth.username || '';
          const password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
          requestHeaders.set('Authorization', 'Basic ' + btoa(username + ':' + password));
        }

        // 完整路径
        const fullPath = buildFullPath(config.baseURL, config.url);

        // 请求参数配置
        request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

        // 设置超时
        request.timeout = config.timeout;

        // 请求完成执行回调
        function onloadend() {
          if (!request) {
            return;
          }
          // Prepare the response
          const responseHeaders = AxiosHeaders.from(
            'getAllResponseHeaders' in request && request.getAllResponseHeaders()
          );
          const responseData = !responseType || responseType === 'text' || responseType === 'json' ?
            request.responseText : request.response;

          // 封装响应体
          const response = {
            data: responseData,
            status: request.status,
            statusText: request.statusText,
            headers: responseHeaders,
            config,
            request
          };

          // 判断请求成功或失败(自定义检测)
          settle(function _resolve(value) {
            resolve(value);
            done();
          }, function _reject(err) {
            reject(err);
            done();
          }, response);

          // Clean up request
          request = null;
        }

        if ('onloadend' in request) {
          request.onloadend = onloadend;
        } else {
          request.onreadystatechange = function handleLoad() {
            if (!request || request.readyState !== 4) {
              return;
            }

            if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
              return;
            }

            setTimeout(onloadend);
          };
        }

        // 取消请求回调
        request.onabort = function handleAbort() {
          if (!request) {
            return;
          }

          reject(new AxiosError('Request aborted', AxiosError.ECONNABORTED, config, request));

          request = null;
        };

        // 处理发送请求错误
        request.onerror = function handleError() {
          reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request));

          request = null;
        };

        // 请求超时处理
        request.ontimeout = function handleTimeout() {
          let timeoutErrorMessage = config.timeout ? 'timeout of ' + config.timeout + 'ms exceeded' : 'timeout exceeded';
          const transitional = config.transitional || transitionalDefaults;
          if (config.timeoutErrorMessage) {
            timeoutErrorMessage = config.timeoutErrorMessage;
          }
          reject(new AxiosError(
            timeoutErrorMessage,
            transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED,
            config,
            request));

          request = null;
        };

        // 如果是浏览器环境,添加xsrf头,防xsrf公爵
        if (platform.isStandardBrowserEnv) {
          const xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath))
            && config.xsrfCookieName && cookies.read(config.xsrfCookieName);

          if (xsrfValue) {
            requestHeaders.set(config.xsrfHeaderName, xsrfValue);
          }
        }

        requestData === undefined && requestHeaders.setContentType(null);

        if ('setRequestHeader' in request) {
          utils.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
            request.setRequestHeader(key, val);
          });
        }

        // 是否添加withCredentials头,表示跨越请求是否携带cookie
        if (!utils.isUndefined(config.withCredentials)) {
          request.withCredentials = !!config.withCredentials;
        }

        // 是否添加响应类型(默认application/json)
        if (responseType && responseType !== 'json') {
          request.responseType = config.responseType;
        }

        if (typeof config.onDownloadProgress === 'function') {
          request.addEventListener('progress', progressEventReducer(config.onDownloadProgress, true));
        }

        if (typeof config.onUploadProgress === 'function' && request.upload) {
          request.upload.addEventListener('progress', progressEventReducer(config.onUploadProgress));
        }

        // 是否支持取消该请求
        if (config.cancelToken || config.signal) {
          // 取消请求回调
          onCanceled = cancel => {
            if (!request) {
              return;
            }
            reject(!cancel || cancel.type ? new CanceledError(null, config, request) : cancel);
            request.abort();
            request = null;
          };

          config.cancelToken && config.cancelToken.subscribe(onCanceled);
          if (config.signal) {
            config.signal.aborted ? onCanceled() : config.signal.addEventListener('abort', onCanceled);
          }
        }

        // 判断协议是否支持,支持['http', 'https', 'file', 'data']
        const protocol = parseProtocol(fullPath);

        if (protocol && platform.protocols.indexOf(protocol) === -1) {
          reject(new AxiosError('Unsupported protocol ' + protocol + ':', AxiosError.ERR_BAD_REQUEST, config));
          return;
        }

        // 发送请求
        request.send(requestData || null);
      });
    }
    ```

  #### 3.3 部分功能实现
  - 拦截器<br />
    在创建Axios类实例时，实例上存在一个```interceptors```属性
    ```JavaScript
      class Axios {
        constructor(instanceConfig) {
          // 写入默认配置,提供请求和响应拦截器存储对象
          this.defaults = instanceConfig;
          this.interceptors = {
            // 保存请求拦截器和响应拦截器
            request: new InterceptorManager(),
            response: new InterceptorManager()
          };
        }
      }
    ```
    ```InterceptorManager```类
    ```JavaScript
    class InterceptorManager {
      constructor() {
        // 保存响应拦截回调函数
        this.handlers = [];
      }

      // 添加响应拦截回调函数
      use(fulfilled, rejected, options) {
        this.handlers.push({
          fulfilled,
          rejected,
          synchronous: options ? options.synchronous : false,
          runWhen: options ? options.runWhen : null
        });
        return this.handlers.length - 1;
      }

      // 删除响应拦截回调函数
      eject(id) {
        if (this.handlers[id]) {
          this.handlers[id] = null;
        }
      }

      // 清除响应拦截回调函数
      clear() {
        if (this.handlers) {
          this.handlers = [];
        }
      }

      forEach(fn) {
        utils.forEach(this.handlers, function forEachHandler(h) {
          if (h !== null) {
            fn(h);
          }
        });
      }
    }
    ```
    ```InterceptorManager```类实现了拦截器的统一管理，注册、注销、清除操作，当在
    ```dispatchRequest```发送请求时，只需要判断是否存在拦截器保存数组(```handlers```)是否有数据，有则执行拦截器回调即可

  - 取消请求<br />
    在请求配置中，可以配置一个```cancelToken```或者```signal```（>=0.22.0）属性表示是否可以取消请求
    ```JavaScript
    // 第一种方式
    const CancelToken = axios.CancelToken;
    const source = CancelToken.source();

    axios.post('/register', {
      cancelToken: source.token
    })
    // 取消请求
    source.cancel()


    const CancelToken = axios.CancelToken;
    let cancel;

    axios.get('/user', {
      cancelToken: new CancelToken(function executor(c) {
        cancel = c;
      })
    });

    // 取消请求
    cancel();
    ```

    ```CancelToken```类
    ```JavaScript
    class CancelToken {
      constructor(executor) {
        if (typeof executor !== 'function') {
          throw new TypeError('executor must be a function.');
        }

        // 创建一个promise实例
        let resolvePromise;

        this.promise = new Promise(function promiseExecutor(resolve) {
          // 把resolve方法提出来,当resolvePromise执行时,this.promise状态会变为fulfilled状态
          resolvePromise = resolve;
        });

        const token = this;

        // 当resolvePromise执行时,this.promist变成fulfilled,就会调用此函数，执行取消操作注册的回调函数
        this.promise.then(cancel => {
          if (!token._listeners) return;

          let i = token._listeners.length;

          while (i-- > 0) {
            token._listeners[i](cancel);
          }
          token._listeners = null;
        });

        this.promise.then = onfulfilled => {
          let _resolve;
          // eslint-disable-next-line func-names
          const promise = new Promise(resolve => {
            token.subscribe(resolve);
            _resolve = resolve;
          }).then(onfulfilled);

          promise.cancel = function reject() {
            token.unsubscribe(_resolve);
          };

          return promise;
        };

        // new CancelToken时会调用executor方法，把cancel函数暴露出去供调用
        executor(function cancel(message, config, request) {
          if (token.reason) {
            return;
          }

          token.reason = new CanceledError(message, config, request);
          // 执行resolvePromise，this.promise变成fulfilled状态
          resolvePromise(token.reason);
        });

        // 添加收到取消请求信号后的回调函数
        subscribe(listener) {
          if (this.reason) {
            listener(this.reason);
            return;
          }

          if (this._listeners) {
            this._listeners.push(listener);
          } else {
            this._listeners = [listener];
          }
        }

        // 删除收到取消请求信号后的回调函数
        unsubscribe(listener) {
          if (!this._listeners) {
            return;
          }
          const index = this._listeners.indexOf(listener);
          if (index !== -1) {
            this._listeners.splice(index, 1);
          }
        }
      }
    }
    ```
    在```xhr.js```中取消实际请求
    ```JavaScript
      // 是否支持取消该请求
      if (config.cancelToken || config.signal) {
        // 取消请求回调
        onCanceled = cancel => {
          if (!request) {
            return;
          }
          reject(!cancel || cancel.type ? new CanceledError(null, config, request) : cancel);
          request.abort();
          request = null;
        };

        // 如果config存在cancel对象，向取消请求操作添加回调函数
        config.cancelToken && config.cancelToken.subscribe(onCanceled);
        if (config.signal) {
          config.signal.aborted ? onCanceled() : config.signal.addEventListener('abort', onCanceled);
        }
      }
    ```
    总体流程：
    1. 当config配置中配置了cancelToken属性时，该属性值为一个CancelToken类的实例
    2. 在```xhr.js```中，我们调用请求之前，判断config是否存在CancelToken属性，当存在此属性时，将取消操作封装到一个函数并添加到CancelToken回调函数中
    3. 当调用取消操作时，实际是调用了```this.promise(Prmise对象)```的```resolve```回调，因此```this.promise```对象变成fulfilled状态
    4. 当```this.promise```状态变成fulfilled后又会调用```then```方法，而在```then```方法中，便会执行添加到CancelToken中的回调函数
    5. 调用的回调函数中执行了```xhr.abort()```操作,因此实现了取消请求