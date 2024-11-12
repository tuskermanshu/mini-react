(function () {
// 这是整个框架的起点
// 作用：将 JSX 转换成虚拟 DOM（Virtual DOM）
// 过程：
// 1. JSX 首先被 Babel 编译成 React.createElement(type, props, ...children) 的调用形式
// 2. createElement 接收这些参数并创建虚拟 DOM 对象
function createElement(type, props, ...children) {
    return {
        type,  // 元素类型（如 'div'、'span' 或函数组件）
        props: {
            ...props,
            // 处理子元素：如果是文本节点就创建特殊的文本元素，否则保持原样
            children: children.map((child) => {
                const isTextNode = typeof child === "string" || typeof child === "number";
                return isTextNode ? createTextNode(child) : child;
            }),
        },
    };
}

  
// createTextNode 函数用于创建文本节点的虚拟 DOM
function createTextNode(nodeValue) {
    return {
        type: "TEXT_ELEMENT", // 特殊的类型标记
        props: {
            nodeValue, // 文本内容
            children: [], // 文本节点没有子节点
        },
    };
}

// 使用示例：
// const element = createElement('div', { className: 'container' },
//    createElement('h1', null, 'Hello'),
//    'World'
// );
// 会创建如下虚拟 DOM：
// {
//   type: 'div',
//   props: {
//     className: 'container',
//     children: [
//       {
//         type: 'h1',
//         props: {
//           children: [{
//             type: 'TEXT_ELEMENT',
//             props: { nodeValue: 'Hello', children: [] }
//           }]
//         }
//       },
//       {
//         type: 'TEXT_ELEMENT',
//         props: { nodeValue: 'World', children: [] }
//       }
//     ]
//   }
// }

  
// 全局变量声明
let nextUnitOfWork = null; // 下一个工作单元（fiber 节点）
let wipRoot = null; // work in progress root - 正在构建的 fiber 树的根节点
let currentRoot = null; // 当前显示在页面上的 fiber 树的根节点
let deletions = null; // 需要删除的节点数组

  
// render 函数 - 初始化渲染过程
function render(element, container) {
    // 创建根 fiber 节点
    wipRoot = {
        dom: container, // 对应的真实 DOM 节点
        props: {
            children: [element], // 要渲染的内容
        },
        alternate: currentRoot, // 链接到上一次渲染的 fiber 树
    };

    deletions = []; // 初始化删除数组
    nextUnitOfWork = wipRoot; // 设置第一个工作单元
}

// 使用示例：
// const element = createElement('div', null, 'Hello');
// const container = document.getElementById('root');
// render(element, container);

  
// 主循环函数 - 实现时间切片
function workLoop(deadline) {
    let shouldYield = false;
    
    // 当有工作且时间充足时继续执行
    while (nextUnitOfWork && !shouldYield) {
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        // 检查是否还有剩余时间
        shouldYield = deadline.timeRemaining() < 1;
    }

    // 如果所有工作完成，提交更改到 DOM
    if (!nextUnitOfWork && wipRoot) {
        commitRoot();
    }

    // 继续请求下一次的空闲回调
    requestIdleCallback(workLoop);
}

//这个 requestIdleCallback 它有的浏览器不支持怎么办？自己实现一个
//浏览器一帧执行正常是16.6ms 如果执行时间大于这个值 可以任务浏览器处于繁忙状态。否则即代表空闲。
//因为requestAnimationFrame这个函数是和渲染保持同步的 可以通过函数获取帧的开始时间，然后使用帧率(开始时间+16.6ms)计算出帧的结束时间, 然后开启一个宏任务，当宏任务被执行时 比较当前的执行时间和帧结束的时间 判断出当前帧是否还有空闲
//因为是宏任务不会像微任务优先级那么高，可以被推迟到下一个事件循环中不会阻塞渲染。这里使用MessageChannel宏任务来实现。
//其实核心就是 获取一帧渲染剩余时间+让执行的任务不阻塞下一次渲染


// 自定义 requestIdleCallback 实现
window.requestIdleCallback =
    window.requestIdleCallback ||
    function (callback, params) {
        const channel = new MessageChannel();
        const port1 = channel.port1;
        const port2 = channel.port2;
        const timeout = params === undefined ? params.timeout : -1;
        let cb = callback;
        let frameDeadlineTime = 0;
        const begin = performance.now();
        let cancelFlag = 0;
        const frameTime = 16.6; // 一帧的理想时间（60fps）

        // 在每一帧开始时设置截止时间
        const runner = (timeStamp) => {
            frameDeadlineTime = timeStamp + frameTime;
            if (cb) {
                port1.postMessage("task");
            }
        };

        // 处理实际的回调执行
        port2.onmessage = () => {
            const timeRemaining = () => {
                const remain = frameDeadlineTime - performance.now();
                return remain > 0 ? remain : 0;
            };

            let didTimeout = false;
            if (timeout > 0) {
                didTimeout = performance.now() - begin > timeout;
            }

            if (!cb) return;

            // 时间不够且未超时，等待下一帧
            if (timeRemaining() <= 1 && !didTimeout) {
                cancelFlag = requestAnimationFrame(runner);
                return cancelFlag;
            }

            // 执行回调
            cb({
                didTimeout,
                timeRemaining,
            });
            cb = null;
        };

        cancelFlag = requestAnimationFrame(runner);
        return cancelFlag;
    };

// 启动主循环
requestIdleCallback(workLoop);

  
// 处理单个工作单元（fiber 节点）
function performUnitOfWork(fiber) {
    // 区分函数组件和普通 DOM 元素
    const isFunctionComponent = fiber.type instanceof Function;
    if (isFunctionComponent) {
        updateFunctionComponent(fiber);
    } else {
        updateHostComponent(fiber);
    }

    // 实现深度优先遍历，返回下一个工作单元
    // 优先返回子节点
    if (fiber.child) {
        return fiber.child;
    }
    // 没有子节点就找兄弟节点
    let nextFiber = fiber;
    while (nextFiber) {
        if (nextFiber.sibling) {
            return nextFiber.sibling;
        }
        // 没有兄弟节点就返回父节点，继续找父节点的兄弟节点
        nextFiber = nextFiber.return;
    }
}
  

// 全局变量 - 用于 Hooks
let wipFiber = null; // 当前正在工作的 fiber 节点
let stateHookIndex = null; // 当前处理的 hook 索引


//为什么effect hook没有这种坐标？
//因为useEffect, 是通过队列搞定的
  

// 更新函数组件
function updateFunctionComponent(fiber) {
    wipFiber = fiber;
    stateHookIndex = 0;
    wipFiber.stateHooks = []; // 存储 state hooks
    wipFiber.effectHooks = []; // 存储 effect hooks

    // 执行函数组件获取子元素
    const children = [fiber.type(fiber.props)];
    reconcileChildren(fiber, children);
}


// 更新普通 DOM 元素
//为啥要把原生和函数分开？
//原生有fom需要创建， 函数组件无dom， 并且它们的处理子节点的方式也不一样
function updateHostComponent(fiber) {
    // 如果没有 DOM 节点，创建一个
    if (!fiber.dom) {
        fiber.dom = createDom(fiber);
    }
    // 协调子元素
    reconcileChildren(fiber, fiber.props.children);
}
  

// 创建 DOM 节点
function createDom(fiber) {
    const dom =
        fiber.type == "TEXT_ELEMENT"
            ? document.createTextNode("")
            : document.createElement(fiber.type);

    updateDom(dom, {}, fiber.props); //添加dom节点内容
    return dom;
}
  

// DOM 属性判断辅助函数 用于updateDom函数中更新Dom节点属性
// 判断一个属性是否是事件处理器：
const isEvent = (key) => key.startsWith("on");
// 判断一个属性是否是普通属性：
const isProperty = (key) => key !== "children" && !isEvent(key);
// 判断一个属性是否是新的或者值已改变：
const isNew = (prev, next) => (key) => prev[key] !== next[key];
// 判断一个属性是否在新的 props 中已被删除：
const isGone = (prev, next) => (key) => !(key in next);
  

//可做初始化使用 ， 或者根据 前面遍历子节点的时候打好的标签进行更新操作（这一步在commitRoot里面才执行）
// 更新 DOM 节点属性
function updateDom(dom, prevProps, nextProps) {
    // 1. 删除旧的事件监听器
    Object.keys(prevProps)
        .filter(isEvent)  // 找出所有事件
        .filter(key => 
            !(key in nextProps) ||  // 事件在新props中不存在
            isNew(prevProps, nextProps)(key)  // 或事件处理函数改变
        )
        .forEach(name => {
            const eventType = name.toLowerCase().substring(2);
            dom.removeEventListener(eventType, prevProps[name]);
        });

    // 2. 删除不再存在的属性
    Object.keys(prevProps)
        .filter(isProperty)  // 找出所有普通属性
        .filter(isGone(prevProps, nextProps))  // 在新props中不存在的
        .forEach(name => {
            dom[name] = "";
        });

    // 3. 设置新的或改变的属性
    Object.keys(nextProps)
        .filter(isProperty)  // 找出所有普通属性
        .filter(isNew(prevProps, nextProps))  // 值改变的属性
        .forEach(name => {
            dom[name] = nextProps[name];
        });

    // 4. 添加新的事件监听器
    Object.keys(nextProps)
        .filter(isEvent)  // 找出所有事件
        .filter(isNew(prevProps, nextProps))  // 值改变的事件
        .forEach(name => {
            const eventType = name.toLowerCase().substring(2);
            dom.addEventListener(eventType, nextProps[name]);
        });
}
  

// 协调子节点（diff 算法的核心） 简单版
function reconcileChildren(wipFiber, elements) {
    let index = 0;
    // 获取旧fiber的第一个子节点
    let oldFiber = wipFiber.alternate?.child;
    let prevSibling = null;

    // 遍历所有子元素
    while (index < elements.length || oldFiber != null) {
        const element = elements[index];
        let newFiber = null;

        // 比较新旧节点的类型
        const sameType = element?.type == oldFiber?.type;

        // 类型相同 - 更新节点
        if (sameType) {
            newFiber = {
                type: oldFiber.type,
                props: element.props,
                dom: oldFiber.dom,
                return: wipFiber,
                alternate: oldFiber,
                effectTag: "UPDATE",
            };
        }
        // 有新节点，类型不同 - 创建新节点
        if (element && !sameType) {
            newFiber = {
                type: element.type,
                props: element.props,
                dom: null,
                return: wipFiber,
                alternate: null,
                effectTag: "PLACEMENT",
            };
        }
        // 有旧节点，类型不同 - 删除旧节点
        if (oldFiber && !sameType) {
            oldFiber.effectTag = "DELETION";
            deletions.push(oldFiber);
        }

        // 移动到下一个旧节点
        if (oldFiber) {
            oldFiber = oldFiber.sibling; // 遍历旧树的所有兄弟节点
        }

        // 设置 fiber 树的链接
        if (index === 0) {
             // 如果是第一个子节点，设置为父节点的 child
            wipFiber.child = newFiber;
        } else if (element) {
            // 如果不是第一个节点，将其设置为前一个节点的 sibling
            prevSibling.sibling = newFiber;
        }

        // 保存当前节点为前一个节点，用于下次设置 sibling
        prevSibling = newFiber;
        // 移动到下一个新节点
        index++;
    }
}
  

// useState Hook 实现
function useState(initialState) {
    const currentFiber = wipFiber;
    // 获取旧的 hook
    const oldHook = wipFiber.alternate?.stateHooks[stateHookIndex];

    // 创建新的 hook
    const stateHook = {
        state: oldHook ? oldHook.state : initialState,
        queue: oldHook ? oldHook.queue : [], // 更新队列
    };

    // 执行所有等待的更新
    stateHook.queue.forEach((action) => {
        stateHook.state = action(stateHook.state);
    });
    stateHook.queue = [];

    // 保存 hook
    stateHookIndex++;
    wipFiber.stateHooks.push(stateHook);

    // 返回更新函数
    function setState(action) {
        const isFunction = typeof action === "function";
        // 将更新动作加入队列
        stateHook.queue.push(isFunction ? action : () => action);

        // 触发重新渲染
        wipRoot = {
            ...currentFiber,
            alternate: currentFiber,
        };
        nextUnitOfWork = wipRoot;
    }

    return [stateHook.state, setState];
}


// 判断依赖项是否改变
function isDepsEqual(deps, newDeps) {
    if (deps.length !== newDeps.length) return false;
    return deps.every((dep, index) => dep === newDeps[index]);
}


// useEffect Hook 实现
function useEffect(callback, deps) {
    const effectHook = {
        callback,
        deps,
        cleanup: undefined,
    };
    wipFiber.effectHooks.push(effectHook);
}
  

// commitRoot: 提交所有更改到真实 DOM
function commitRoot() {
    // 1. 先处理需要删除的节点
    deletions.forEach(commitWork);
    
    // 2. 提交新的/更新的节点（从根节点的子节点开始）
    commitWork(wipRoot.child);
    
    // 3. 处理所有的 effect hooks
    commitEffectHooks();
    
    // 4. 保存当前 fiber 树，以便下次更新时比较
    currentRoot = wipRoot;
    
    // 5. 清理全局变量
    wipRoot = null;
    deletions = [];
}
  

// commitWork: 递归执行 DOM 操作
// 将 fiber 树看作二叉树：
// - 左子树是 child（子节点）
// - 右子树是 sibling（兄弟节点）
function commitWork(fiber) {
    if (!fiber) return;

    // 查找父 DOM 节点
    // 对于函数组件，需要向上遍历找到最近的有 DOM 的节点
    let domParentFiber = fiber.return;
    while (!domParentFiber.dom) {
        domParentFiber = domParentFiber.return;
    }
    const domParent = domParentFiber.dom;

    // 根据 effectTag 执行相应的 DOM 操作
    if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
        // 新增节点
        domParent.appendChild(fiber.dom);
    } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
        // 更新节点
        updateDom(fiber.dom, fiber.alternate.props, fiber.props);
    } else if (fiber.effectTag === "DELETION") {
        // 删除节点
        commitDeletion(fiber, domParent);
    }

    // 递归处理子节点和兄弟节点
    commitWork(fiber.child);
    commitWork(fiber.sibling);
}
  
// commitDeletion: 处理节点删除
// 需要特殊处理函数组件的情况
function commitDeletion(fiber, domParent) {
    if (fiber.dom) {
        // 如果有 DOM 节点，直接删除
        domParent.removeChild(fiber.dom);
    } else {
        // 函数组件没有 DOM 节点，需要递归查找子节点
        commitDeletion(fiber.child, domParent);
    }
}

// commitEffectHooks: 处理 useEffect 的执行
function commitEffectHooks() {
    // 清理函数：执行旧的 effect 的清理函数
    function runCleanup(fiber) {
        if (!fiber) return;

        // 遍历所有 effect hooks
        fiber.alternate?.effectHooks?.forEach((hook, index) => {
            const deps = fiber.effectHooks[index].deps;

            // 如果没有依赖项或依赖项改变，执行清理函数
            if (!hook.deps || !isDepsEqual(hook.deps, deps)) {
                hook.cleanup?.();
            }
        });

        // 递归处理子节点和兄弟节点
        runCleanup(fiber.child);
        runCleanup(fiber.sibling);
    }

    // 执行函数：执行新的 effect
    function run(fiber) {
        if (!fiber) return;

        fiber.effectHooks?.forEach((newHook, index) => {
            // 首次渲染
            if (!fiber.alternate) {
                newHook.cleanup = newHook.callback();
                return;
            }

            // 没有依赖项的 effect 每次都执行
            if (!newHook.deps) {
                newHook.cleanup = newHook.callback();
            }

            // 有依赖项且依赖项改变时执行
            if (newHook.deps.length > 0) {
                const oldHook = fiber.alternate?.effectHooks[index];

                if (!isDepsEqual(oldHook.deps, newHook.deps)) {
                    newHook.cleanup = newHook.callback();
                }
            }
        });

        // 递归处理子节点和兄弟节点
        run(fiber.child);
        run(fiber.sibling);
    }

    // 先执行清理函数，再执行新的 effect
    runCleanup(wipRoot);
    run(wipRoot);
}


  
// 辅助函数：比较依赖项是否相等
function isDepsEqual(deps, newDeps) {
    if (deps.length !== newDeps.length) {
        return false;
    }

    for (let i = 0; i < deps.length; i++) {
        if (deps[i] !== newDeps[i]) {
            return false;
        }
    }
    return true;
}
  

  
const MiniReact = {
      createElement,
      render,
      useState,
      useEffect,
    };
    
  //用立即执行函数包裹起来， 防止全局变量污染
    window.MiniReact = MiniReact;
  })();