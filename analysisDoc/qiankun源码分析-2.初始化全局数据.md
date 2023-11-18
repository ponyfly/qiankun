## 初始化全局数据

qk 提供了`initGlobalState`方法来初始化全局数据，该方法接受一个对象作为参数，该函数返回两个函数`onGlobalStateChange`和`setGlobalState`，分别用于监听和修改全局数据。

```ts
let globalState: Record<string, any> = {};
export function initGlobalState(state: Record<string, any> = {}) {
  //...
  if (state === globalState) {
    console.warn('[qiankun] state has not changed！');
  } else {
    const prevGlobalState = cloneDeep(globalState);
    globalState = cloneDeep(state);
    emitGlobal(globalState, prevGlobalState);
  }
  return getMicroAppStateActions(`global-${+new Date()}`, true);
}
```

这个函数做了两件事：

1. 保存全局数据,`emitGlobal`函数我们暂时不分析，随后会分析，可以先忽略
2. 返回`getMicroAppStateActions`的调用结果，`getMicroAppStateActions`返回`onGlobalStateChange`和`setGlobalState`两个函数，我们看下`getMicroAppStateActions`的源码：

```ts
const deps: Record<string, OnGlobalStateChangeCallback> = {};
export function getMicroAppStateActions(id: string, isMaster?: boolean): MicroAppStateActions {
  return {
    /**
     * onGlobalStateChange 全局依赖监听
     */
    onGlobalStateChange(callback: OnGlobalStateChangeCallback, fireImmediately?: boolean) {
      deps[id] = callback;
      if (fireImmediately) {
        const cloneState = cloneDeep(globalState);
        callback(cloneState, cloneState);
      }
    },

    /**
     * setGlobalState 更新 store 数据
     *
     * 1. 对输入 state 的第一层属性做校验，只有初始化时声明过的第一层（bucket）属性才会被更改
     * 2. 修改 store 并触发全局监听
     *
     * @param state
     */
    setGlobalState(state: Record<string, any> = {}) {
      if (state === globalState) {
        console.warn('[qiankun] state has not changed！');
        return false;
      }

      const changeKeys: string[] = [];
      const prevGlobalState = cloneDeep(globalState);
      globalState = cloneDeep(
        Object.keys(state).reduce((_globalState, changeKey) => {
          if (isMaster || _globalState.hasOwnProperty(changeKey)) {
            changeKeys.push(changeKey);
            return Object.assign(_globalState, { [changeKey]: state[changeKey] });
          }
          console.warn(`[qiankun] '${changeKey}' not declared when init state！`);
          return _globalState;
        }, globalState),
      );
      if (changeKeys.length === 0) {
        console.warn('[qiankun] state has not changed！');
        return false;
      }
      emitGlobal(globalState, prevGlobalState);
      return true;
    },

    // 注销该应用下的依赖
    offGlobalStateChange() {
      delete deps[id];
      return true;
    },
  };
}
```

这个函数结构也是很清晰的，入参为 id 和 isMaster,在这里 isMaster 为 true,id 为`global-当前时间`，return 了一个对象，其中的两个属性就是我们的`onGlobalStateChange`和`setGlobalState`， `onGlobalStateChange`,接受两个参数，第一个参数必填，是一个回调函数，第二个参数是可选的，是一个布尔值，用于控制是否立即执行回调函数，这里我们只分析`fireImmediately`为 false 的情况，当调用这个函数的时候，会往全局的 deps 下添加一个回调函数，这个回调函数的 key 为 id，value 为传入的回调函数，这个回调函数的作用是在全局数据发生变化的时候，执行传入的回调函数，这个回调函数的入参为全局数据和上一次的全局数据，我们看下实际使用时的例子：

```ts
onGlobalStateChange((value, prev) => console.log('[onGlobalStateChange - master]:', value, prev));
```

接下来我们再看下`setGlobalState`函数，这个函数接受一个对象作为参数，这个对象就是我们要修改的全局数据，它做了两件事：

1. 新旧数据的比较，如果没有变化，就不执行后续操作，否则修改全局 globalState(源码中有关于只会修改初始化时的第一层 bucket，目前好像没有看到相关逻辑，后续再看)
2. 触发全局的监听函数`emitGlobal`，这个函数的作用是遍历全局的 deps，执行所有的回调函数，这些回调函数的入参为全局数据和上一次的全局数据，我们看下函数定义：

```ts
function emitGlobal(state: Record<string, any>, prevState: Record<string, any>) {
  Object.keys(deps).forEach((id: string) => {
    if (deps[id] instanceof Function) {
      deps[id](cloneDeep(state), cloneDeep(prevState));
    }
  });
}
```

代码比较简单，遍历 deps，执行所有的回调函数，并传入全局数据和老的全局数据，这样我们就可以在全局数据发生变化的时候，执行我们的回调函数，这样就实现了全局数据的监听。流程图如下：
