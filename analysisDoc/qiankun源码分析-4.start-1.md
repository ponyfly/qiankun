## start

调用 start 方法，开始加载应用程序，源码如下：

```ts
const defaultUrlRerouteOnly = true;
export let frameworkConfiguration: FrameworkConfiguration = {};
let started = false;
export function start(opts: FrameworkConfiguration = {}) {
  // 设置全局默认配置，
  frameworkConfiguration = { prefetch: true, singular: true, sandbox: true, ...opts };
  // 获取配置中的  prefetch 以及 urlRerouteOnly， 默认都为true
  const { prefetch, urlRerouteOnly = defaultUrlRerouteOnly, ...importEntryOpts } = frameworkConfiguration;

  // 如果配置了 prefetch， 则执行预加载策略
  if (prefetch) {
    doPrefetchStrategy(microApps, prefetch, importEntryOpts);
  }

  // 为低版本的浏览器自动降级
  frameworkConfiguration = autoDowngradeForLowVersionBrowser(frameworkConfiguration);

  // 执行single-spa中的start函数
  startSingleSpa({ urlRerouteOnly });
  started = true;

  frameworkStartedDefer.resolve();
}
```

当前我们的`start`函数的入参为空，所以这里的 opts 为空对象，然后做了以下两件大事情：

1. 如果配置了 prefetch， 则执行预加载策略
2. 执行 single-spa 中的 start 函数，设置 started 为 true

### 1. 预加载策略

我们首先分析下预加载策略，这里的预加载策略是在`doPrefetchStrategy`函数中实现的，源码如下：

```ts
/**
 * 执行预加载策略
 * @param apps app列表
 * @param prefetchStrategy 预加载策略，可选 boolean | 'all' | string[] | function, 默认为 true
 * @param importEntryOpts import-html-entry 配置项，稍后分析
 */
export function doPrefetchStrategy(
  apps: AppMetadata[],
  prefetchStrategy: PrefetchStrategy,
  importEntryOpts?: ImportEntryOpts,
) {
  // 定义函数：将app name转换为app metadata
  const appsName2Apps = (names: string[]): AppMetadata[] => apps.filter((app) => names.includes(app.name));

  // 根据预加载策略，执行预加载
  if (Array.isArray(prefetchStrategy)) {
    prefetchAfterFirstMounted(appsName2Apps(prefetchStrategy as string[]), importEntryOpts);
  } else if (isFunction(prefetchStrategy)) {
    (async () => {
      // critical rendering apps would be prefetch as earlier as possible
      const { criticalAppNames = [], minorAppsName = [] } = await prefetchStrategy(apps);
      prefetchImmediately(appsName2Apps(criticalAppNames), importEntryOpts);
      prefetchAfterFirstMounted(appsName2Apps(minorAppsName), importEntryOpts);
    })();
  } else {
    switch (prefetchStrategy) {
      // 默认为true 会执行这里的逻辑
      case true:
        // 在mounted之后 预加载所有app
        prefetchAfterFirstMounted(apps, importEntryOpts);
        break;

      case 'all':
        prefetchImmediately(apps, importEntryOpts);
        break;

      default:
        break;
    }
  }
}
```

首先看下入参，`apps`为应用列表，`prefetchStrategy`为预加载策略， 当前为 true，`importEntryOpts`为`import-html-entry`的配置项，当前为`{singular: true, sandbox: true}`。我们继续分析`doPrefetchStrategy`函数，首先定义了一个函数`appsName2Apps`，该函数的作用是将 app name 转换为 app metadata，然后根据预加载策略，执行预加载。因为`prefetchStrategy`为 true，所以会执行`prefetchAfterFirstMounted`函数，该函数的作用是在 mounted 之后 预加载所有 app，源码如下：

```ts
// 在第一次mounted之后，预加载未加载的app
function prefetchAfterFirstMounted(apps: AppMetadata[], opts?: ImportEntryOpts): void {
  window.addEventListener('single-spa:first-mount', function listener() {
    // 获取未加载的app
    const notLoadedApps = apps.filter((app) => getAppStatus(app.name) === NOT_LOADED);

    if (process.env.NODE_ENV === 'development') {
      const mountedApps = getMountedApps();
      console.log(`[qiankun] prefetch starting after ${mountedApps} mounted...`, notLoadedApps);
    }

    // 预加载未加载的app
    notLoadedApps.forEach(({ entry }) => prefetch(entry, opts));

    window.removeEventListener('single-spa:first-mount', listener);
  });
}
```

该函数的实现很简单，就是监听`single-spa:first-mount`事件，当第一次应用被挂载时，预加载未加载的 app,这里我们随后再来分析事件是如何被触发的。

暂时总结下：_`doPrefetchStrategy`是用来注册预加载策略的，即在第一次应用被挂载时，预加载未加载的 app。_

### frameworkConfiguration

我们回过头继续分析`start`函数，当前已经执行完预加载策略，接下来有一行代码

```ts
frameworkConfiguration = autoDowngradeForLowVersionBrowser(frameworkConfiguration);
```

该函数的作用重新修改了下`frameworkConfiguration`的配置，为低版本的浏览器自动降级，源码如下：

```ts
const autoDowngradeForLowVersionBrowser = (configuration: FrameworkConfiguration): FrameworkConfiguration => {
  const { sandbox = true, singular } = configuration;
  if (sandbox) {
    if (!window.Proxy) {
      // 不支持proxy, 使用快照沙箱
      console.warn('[qiankun] Missing window.Proxy, proxySandbox will degenerate into snapshotSandbox');

      if (singular === false) {
        console.warn(
          '[qiankun] Setting singular as false may cause unexpected behavior while your browser not support window.Proxy',
        );
      }

      return { ...configuration, sandbox: typeof sandbox === 'object' ? { ...sandbox, loose: true } : { loose: true } };
    }

    // 如果不支持结构赋值，将关闭快速模式，快速模式作用是什么？
    if (
      !isConstDestructAssignmentSupported() &&
      (sandbox === true || (typeof sandbox === 'object' && sandbox.speedy !== false))
    ) {
      console.warn(
        '[qiankun] Speedy mode will turn off as const destruct assignment not supported in current browser!',
      );

      return {
        ...configuration,
        sandbox: typeof sandbox === 'object' ? { ...sandbox, speedy: false } : { speedy: false },
      };
    }
  }

  return configuration;
};
```

函数入参为`frameworkConfiguration`，首先获取了`frameworkConfiguration`中的`sandbox`和`singular`，这里我们的实参为`{prefetch: true, singular: true, sandbox: true}`，然后判断是否支持`window.Proxy`，如果不支持`window.Proxy`，则使用快照沙箱，那么我们的函数 return 的值为：`{prefetch: true, singular: true, sandbox: { loose: true }}`, 如果支持`window.Proxy`，则判断是否支持结构赋值，如果不支持结构赋值，则关闭快速模式，那么我们的函数 return 的值为：`{prefetch: true, singular: true, sandbox: { speedy: false }}`。

小结：_`autoDowngradeForLowVersionBrowser`函数的作用是为低版本的浏览器自动降级，如果不支持`window.Proxy`，则使用快照沙箱，如果支持`window.Proxy`，则判断是否支持结构赋值，如果不支持结构赋值，则关闭快速模式。具体 sandbox 的不同值对应的逻辑是什么我们随后再分析_

### startSingleSpa

我们继续分析`start`函数，当预加载策略配置完，且做完自动降级的配置后，会执行我们很重要的一个函数`startSingleSpa`，该函数的作用是执行 single-spa 中的 start 函数，源码如下：

```ts
started = false;
export function start(opts) {
  started = true;
  if (opts && opts.urlRerouteOnly) {
    setUrlRerouteOnly(opts.urlRerouteOnly);
  }
  if (isInBrowser) {
    reroute();
  }
}
```

该函数的入参为`{urlRerouteOnly: true}`，然后设置了`started`为 true，然后执行`setUrlRerouteOnly`,该函数的作用是设置`urlRerouteOnly`，源码如下：

```ts
let urlRerouteOnly;

export function setUrlRerouteOnly(val) {
  urlRerouteOnly = val;
}
```

这里很简单，我们就不分析了，我们回过头继续分析 start，接下来会执行`reroute`函数，源码如下：

```ts
export function reroute(pendingPromises = [], eventArguments) {
  const {
    appsToUnload,
    appsToUnmount,
    appsToLoad,
    appsToMount,
  } = getAppChanges();
  let appsThatChanged,
    navigationIsCanceled = false,
    oldUrl = currentUrl,
    newUrl = (currentUrl = window.location.href);

	// 是否已经执行start方法
  if (isStarted()) {
    appChangeUnderway = true;
    appsThatChanged = appsToUnload.concat(
      appsToLoad,
      appsToUnmount,
      appsToMount
    );
    return performAppChanges();
  } else {
    appsThatChanged = appsToLoad;
    return loadApps();
  }

  function cancelNavigation() {...}

  function loadApps() {...}

  function performAppChanges() {...}

  function finishUpAndReturn() {...}

  /* We need to call all event listeners that have been delayed because they were
   * waiting on single-spa. This includes haschange and popstate events for both
   * the current run of performAppChanges(), but also all of the queued event listeners.
   * We want to call the listeners in the same order as if they had not been delayed by
   * single-spa, which means queued ones first and then the most recent one.
   */
  function callAllEventListeners() {...}

  function getCustomEventDetail(isBeforeChanges = false, extraProperties) {...}
}
```

我们只保留了主要的逻辑，当我们调用`isStarted`函数时，会返回`true`，所以会执行`performAppChanges`函数，该函数的作用是执行应用程序的变更，源码如下：

```ts
function performAppChanges() {
  return Promise.resolve().then(() => {
    // https://github.com/single-spa/single-spa/issues/545

    // ...

    const unloadPromises = appsToUnload.map(toUnloadPromise);

    const unmountUnloadPromises = appsToUnmount
      .map(toUnmountPromise)
      .map((unmountPromise) => unmountPromise.then(toUnloadPromise));

    const allUnmountPromises = unmountUnloadPromises.concat(unloadPromises);

    const unmountAllPromise = Promise.all(allUnmountPromises);

    unmountAllPromise.then(() => {
      window.dispatchEvent(new CustomEvent('single-spa:before-mount-routing-event', getCustomEventDetail(true)));
    });

    /* We load and bootstrap apps while other apps are unmounting, but we
     * wait to mount the app until all apps are finishing unmounting
     */
    const loadThenMountPromises = appsToLoad.map((app) => {
      return toLoadPromise(app).then((app) => tryToBootstrapAndMount(app, unmountAllPromise));
    });

    /* These are the apps that are already bootstrapped and just need
     * to be mounted. They each wait for all unmounting apps to finish up
     * before they mount.
     */
    const mountPromises = appsToMount
      .filter((appToMount) => appsToLoad.indexOf(appToMount) < 0)
      .map((appToMount) => {
        return tryToBootstrapAndMount(appToMount, unmountAllPromise);
      });
    return unmountAllPromise
      .catch((err) => {
        callAllEventListeners();
        throw err;
      })
      .then(() => {
        /* Now that the apps that needed to be unmounted are unmounted, their DOM navigation
         * events (like hashchange or popstate) should have been cleaned up. So it's safe
         * to let the remaining captured event listeners to handle about the DOM event.
         */
        callAllEventListeners();

        return Promise.all(loadThenMountPromises.concat(mountPromises))
          .catch((err) => {
            pendingPromises.forEach((promise) => promise.reject(err));
            throw err;
          })
          .then(finishUpAndReturn);
      });
  });
}
```

这里的 promise 嵌套有点多，我们不防从 return 出发，看看做了什么？首先是卸载应用`unmountAllPromise`，然后是挂载应用`loadThenMountPromises`，最后是执行`finishUpAndReturn`函数，对于我们当下的场景，待卸载应用和待挂载应用都是空，所以我们可以略过细节，去看最后的`finishUpAndReturn`函数，源码如下：

```ts
function finishUpAndReturn() {
  const returnValue = getMountedApps();
  pendingPromises.forEach((promise) => promise.resolve(returnValue));

  try {
    const appChangeEventName = appsThatChanged.length === 0 ? 'single-spa:no-app-change' : 'single-spa:app-change';
    window.dispatchEvent(new CustomEvent(appChangeEventName, getCustomEventDetail()));
    window.dispatchEvent(new CustomEvent('single-spa:routing-event', getCustomEventDetail()));
  } catch (err) {
    /* We use a setTimeout because if someone else's event handler throws an error, single-spa
     * needs to carry on. If a listener to the event throws an error, it's their own fault, not
     * single-spa's.
     */
    setTimeout(() => {
      throw err;
    });
  }
  // ...

  return returnValue;
}
```

刚刚我们提到了，没有挂载和卸载的应用，那么`appsThatChanged`自然为空，那么最后会触发事件`single-spa:no-app-change`,还记得我们在`setDefaultMountApp`函数中监听了`single-spa:no-app-change`事件吗？当没有应用被挂载时，跳转到默认应用，是不是串起来了？我们回过头看下`setDefaultMountApp`函数，源码如下：

```ts
export function setDefaultMountApp(defaultAppLink: string) {
  // can not use addEventListener once option for ie support
  window.addEventListener('single-spa:no-app-change', function listener() {
    const mountedApps = getMountedApps();
    if (!mountedApps.length) {
      navigateToUrl(defaultAppLink);
    }

    window.removeEventListener('single-spa:no-app-change', listener);
  });
}
```

这里`mountedApps`为空，所以会执行`navigateToUrl`函数，该函数的作用是跳转到默认应用，源码如下：

```ts
export function navigateToUrl(obj) {
  let url;
  if (typeof obj === 'string') {
    url = obj;
  }
  // ...

  const current = parseUri(window.location.href);
  const destination = parseUri(url);

  if (url.indexOf('#') === 0) {
    window.location.hash = destination.hash;
  } else if (current.host !== destination.host && destination.host) {
    if (process.env.BABEL_ENV === 'test') {
      return { wouldHaveReloadedThePage: true };
    } else {
      window.location.href = url;
    }
  } else if (destination.pathname === current.pathname && destination.search === current.search) {
    window.location.hash = destination.hash;
  } else {
    // different path, host, or query params
    window.history.pushState(null, null, url);
  }
}
```

在我们的场景下，`defaultAppLink`为`/react16`,_最终进入最后一个 else 逻辑`window.history.pushState(null, null, url)`，这里是个重点_，我们都知道`pushState`会改变浏览器的历史记录，地址栏会变成塞入的 url,但是页面不会改变，那么问题来了，我们是如何跳转到`/react16`的呢？我们回过头看下`reroute`函数，源码如下：

```ts
// single-spa/src/navigation/navigation-events.js

window.history.pushState = patchedUpdateState(window.history.pushState, 'pushState');
window.history.replaceState = patchedUpdateState(window.history.replaceState, 'replaceState');
function patchedUpdateState(updateState, methodName) {
  return function () {
    const urlBefore = window.location.href;
    const result = updateState.apply(this, arguments);
    const urlAfter = window.location.href;

    if (!urlRerouteOnly || urlBefore !== urlAfter) {
      if (isStarted()) {
        // fire an artificial popstate event once single-spa is started,
        // so that single-spa applications know about routing that
        // occurs in a different application
        window.dispatchEvent(createPopStateEvent(window.history.state, methodName));
      } else {
        // do not fire an artificial popstate event before single-spa is started,
        // since no single-spa applications need to know about routing events
        // outside of their own router.
        reroute([]);
      }
    }

    return result;
  };
}

window.addEventListener('hashchange', urlReroute);
window.addEventListener('popstate', urlReroute);
```

上面这段代码，是`single-spa`的一段全局代码，可以看到，我们对`window.history.pushState`和`window.history.replaceState`进行了重写，重写的逻辑是：如果`urlRerouteOnly`为`false`，或者`urlBefore`和`urlAfter`不相等，则触发`popstate`事件，然后执行`reroute`函数，这里我们的`urlRerouteOnly`为`true`，但是 before 和 after 不同，所以会触发事件，我们看下`createPopStateEvent`函数，源码如下：

```ts
function createPopStateEvent(state, originalMethodName) {
  let evt;
  try {
    evt = new PopStateEvent('popstate', { state });
  } catch (err) {
    // IE 11 compatibility https://github.com/single-spa/single-spa/issues/299
    // https://docs.microsoft.com/en-us/openspecs/ie_standards/ms-html5e/bd560f47-b349-4d2c-baa8-f1560fb489dd
    evt = document.createEvent('PopStateEvent');
    evt.initPopStateEvent('popstate', false, false, state);
  }
  evt.singleSpa = true;
  evt.singleSpaTrigger = originalMethodName;
  return evt;
}
```

这里我们可以看到，我们触发的是`popstate`事件，然后执行`urlReroute`函数，源码如下：

```ts
function urlReroute() {
  reroute([], arguments);
}
```

可以发现，最后还是调用了 reroute 函数，这里的`arguments`是`popstate`事件的参数，`reroute`最后会调用`performAppChanges`函数，那么当再次调用这个函数的时候，我们的`appsToLoad`就不为空了，我们回过头看下`performAppChanges`函数，其中的逻辑我们在分析`single-spa`的时候已经分析过了，这里我们就看一下关键逻辑：

```ts
const loadThenMountPromises = appsToLoad.map((app) => {
  return toLoadPromise(app).then((app) => tryToBootstrapAndMount(app, unmountAllPromise));
});
```

这个函数的作用是加载并挂载应用,加载和挂载这里的大致逻辑其实我们在分析`single-spa`的时候已经分析过了，但它是如何和`qiankun`结合起来的呢？我们下一篇文章详细分析加载和挂载的过程。
