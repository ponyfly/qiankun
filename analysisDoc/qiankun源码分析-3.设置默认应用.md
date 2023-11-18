## setDefaultMountApp

设置默认应用是通过`setDefaultMountApp`实现的，该方法接收一个`string`类型的参数，该参数为应用的`basename`。

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

函数的实现很简单，就是监听`single-spa:no-app-change`事件，当没有应用被挂载时，跳转到默认应用。 `single-spa:no-app-change`是`single-spa`的自定义事件，该事件在`single-spa`的`start`方法中被触发。具体是何时触发`single-spa:no-app-change`事件，我们在下一篇会有所介绍。
