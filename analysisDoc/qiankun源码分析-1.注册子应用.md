## 注册子应用

注册子应用，通过 registerMicroApps 方法，参数为 MicroApp[]和 LifeCycles，MicroApp 为子应用的配置项，包含 name、entry、container、activeRule、props 等属性。

```js
registerMicroApps(
  [
    {
      name: 'react16',
      entry: '//localhost:7100',
      container: '#subapp-viewport',
      loader,
      activeRule: '/react16',
    },
    {
      name: 'vue',
      entry: '//localhost:7101',
      container: '#subapp-viewport',
      loader,
      activeRule: '/vue',
    },
  ],
  {
    beforeLoad: [
      (app) => {
        console.log('[LifeCycle] before load %c%s', 'color: green;', app.name);
      },
    ],
    beforeMount: [
      (app) => {
        console.log('[LifeCycle] before mount %c%s', 'color: green;', app.name);
      },
    ],
    afterUnmount: [
      (app) => {
        console.log('[LifeCycle] after unmount %c%s', 'color: green;', app.name);
      },
    ],
  },
);
```

第一个参是是我们的子应用数组，第二个参数是生命周期钩子函数，我们可以利用这些钩子在子应用挂载的不同的阶段插入一些事情，源码如下：

```js

export function registerMicroApps<T extends ObjectType>(
  apps: Array<RegistrableApp<T>>,
  lifeCycles?: FrameworkLifeCycles<T>,
) {
  // Each app only needs to be registered once
  // 过滤出未注册的app
  const unregisteredApps = apps.filter((app) => !microApps.some((registeredApp) => registeredApp.name === app.name));

  // 未注册的app合并到microApps
  microApps = [...microApps, ...unregisteredApps];

  // 遍历未注册的app，注册到single-spa
  unregisteredApps.forEach((app) => {
    const { name, activeRule, loader = noop, props, ...appConfig } = app;

		// 调用single-spa的registerApplication方法注册子应用
    registerApplication({
      name,
      app: async () => {
        await frameworkStartedDefer.promise;

        const { mount, ...otherMicroAppConfigs } = (
          await loadApp({ name, props, ...appConfig }, frameworkConfiguration, lifeCycles)
        )();

        return {
          mount: [async () => loader(true), ...toArray(mount), async () => loader(false)],
          ...otherMicroAppConfigs,
        };
      },
      activeWhen: activeRule,
      customProps: props,
    });
  });
}

```

registerMicroApps 的主要目的就是注册子 q 应用，最终调用 single-spas 的 registerApplication 方法注册子应用，single-spa 的`registerApplication`我们在之前的文章中有介绍到，其目的是注册子应用，并且给子应用添加默认的初始状态，然后调用 reroute 函数，继而会调用 loadsApp 去加载所有待加载的应用，其实此时是不会加载任何 app 的，因为我们的路由还没有匹配到任何子应用，所以也就不会调用 loadApp 去加载子应用，当路由匹配到子应用时，single-spa 会调用 loadApp 去加载子应用，那么这个阶段的流程调用图如下： [图片]()
