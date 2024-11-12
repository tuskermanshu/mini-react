# Mini React
  一个简化版的 React 实现，用于学习和理解 React 的核心原理。这个项目包含了 React 的基本功能实现，包括虚拟 DOM、Fiber 架构、函数组件、Hooks 等核心特性。

## 核心功能

1. 虚拟DOM
    - createElement 函数 - JSX 转换
    - 虚拟 DOM 的创建和处理

2. Fiber 架构
    - 可中断的渲染过程
    - 基于requestIdleCallback的时间切片
    - 深度优先的节点遍历

3. Hooks支持
    - useState 状态管理
    - useEffect 副作用处理


## 实现细节

### 渲染过程

Mini React 的渲染过程可以分为以下几个主要阶段：

1. JSX 转换
    ``` JSX
    <div className="container">
      <h1>Hello</h1>
      <p>Mini React</p>
    </div>
    // 经过 Babel 转换后变成
    MiniReact.createElement(
      "div",
      { className: "container" },
      MiniReact.createElement("h1", null, "Hello"),
      MiniReact.createElement("p", null, "Mini React")
    )
    ```

2. 虚拟DOM生成

    ```JS
    // createElement 返回的虚拟 DOM 结构
    {
      type: "div",
      props: {
        className: "container",
        children: [
          {
            type: "h1",
            props: {
              children: [{
                type: "TEXT_ELEMENT",
                props: {
                  nodeValue: "Hello",
                  children: []
                }
              }]
            }
          },
          {
            type: "p",
            props: {
              children: [{
                type: "TEXT_ELEMENT",
                props: {
                  nodeValue: "Mini React",
                  children: []
                }
              }]
            }
          }
        ]
      }
    }
    ```

3. Fiber树构建

    ``` JS
    //  初始化 创建根 Fiber 节点
    wipRoot = {
      dom: container,
      props: {
        children: [element]
      },
      alternate: currentRoot
    }
    
    //  工作循环
    
    function workLoop(deadline) {
      // 是否应该暂停渲染
      let shouldYield = false;
    
      // 循环处理工作单元，直到没有工作或需要暂停
      while (nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        shouldYield = deadline.timeRemaining() < 1;
      }
    
      // 如果所有工作完成，提交更改
      if (!nextUnitOfWork && wipRoot) {
        commitRoot();
      }
    
      requestIdleCallback(workLoop);
    }
    
    // 深度优先遍历
    
    function performUnitOfWork(fiber) {
      // 1. 创建 DOM 节点
      if (!fiber.dom) {
        fiber.dom = createDom(fiber);
      }
    
      // 2. 处理子元素，创建 Fiber 节点
      const elements = fiber.props.children;
      reconcileChildren(fiber, elements);
    
      // 3. 返回下一个工作单元
      if (fiber.child) {
        return fiber.child;
      }
      let nextFiber = fiber;
      while (nextFiber) {
        if (nextFiber.sibling) {
          return nextFiber.sibling;
        }
        nextFiber = nextFiber.parent;
      }
    }
    
    
    // 提交阶段
    
    function commitRoot() {
      // 1. 处理需要删除的节点
      deletions.forEach(commitWork);
    
      // 2. 提交新的/更新的节点
      commitWork(wipRoot.child);
    
      // 3. 保存当前 Fiber 树
      currentRoot = wipRoot;
    
      // 4. 清理变量
      wipRoot = null;
    }
    ```

### 渲染过程的关键特性：
1. 可终端
    - 使用 requestIdleCallback 进行时间切片
    - 每个 Fiber 节点作为一个工作单元
    - 可以在任意 Fiber 节点处暂停和恢复
2. 优先级调度
    - 通过 deadline.timeRemaining() 检查剩余时间
    - 在浏览器空闲时执行渲染工作
    - 可以随时中断以响应更高优先级的任务
3. 深度优先遍历
    - 遍历顺序：child → sibling → return
    - 构建完整的 Fiber 树结构
    - 保证节点之间的正确关联
4. 批量更新
    - 收集所有更新后统一提交
    - 分离构建阶段和提交阶段
    - 减少 DOM 操作次数