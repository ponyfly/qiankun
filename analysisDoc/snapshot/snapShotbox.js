function iter(obj, callbackFn) {
  for (const prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      callbackFn(prop);
    }
  }
}
class Sandbox {
  windowSnapshot;
  modifyPropsMap = {};
  constructor() {
    this.windowSnapshot = {};
  }
  active() {
    this.windowSnapshot = {};
    iter(myWindow, (prop) => {
      this.windowSnapshot[prop] = myWindow[prop];
    });
    // 恢复之前的变更
    Object.keys(this.modifyPropsMap).forEach((p) => {
      myWindow[p] = this.modifyPropsMap[p];
    });
  }
  inactive() {
    iter(myWindow, (prop) => {
      if (myWindow[prop] !== this.windowSnapshot[prop]) {
        this.modifyPropsMap[prop] = myWindow[prop];
        myWindow[prop] = this.windowSnapshot[prop];
      }
    });
  }
}
// 这是我们模拟的全局window对象, 在上面有三个属性, name, desc, data，sayYes
const myWindow = {
  name: '这是模拟的全局window对象',
  desc: '这是主项目的描述',
  data: {
    age: 12,
  },
};

// 加载子应用的沙箱
const sandbox = new Sandbox();
// 激活沙箱
sandbox.active();
// 子应用完成加载
// 在子应用中修改全局window对象（也就是我们的myWidow）
myWindow.name = '这是子应用修改后的全局window对象';
myWindow.desc = '这是子应用修改后的描述';
myWindow.newData = {
  age: 13,
};
console.log(myWindow);
// 输出结果为下面这样
// {"name": "这是子应用修改后的全局window对象", "desc": "这是子应用修改后的描述","data": { "age": 12},"newData": {"age": 13}}
// 可以看到在子应用中，我们的全局window对象已经被修改了

// 子应用卸载
// 失活沙箱
sandbox.inactive();
console.log(myWindow);
// 输出结果为下面这样
// { "name": "这是模拟的全局window对象", "desc": "这是主项目的描述", "data": { "age": 12 }, "newData": undefined}
// 从上面的结果可以看出, 子应用修改的全局window对象并没有影响原来的window, 这就是沙箱的作用
sandbox.active();
console.log(myWindow);
// 输出结果为下面这样
// {"name": "这是子应用修改后的全局window对象", "desc": "这是子应用修改后的描述","data": { "age": 12},"newData": {"age": 13}}
