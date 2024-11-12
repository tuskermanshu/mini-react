

const { render, useState, useEffect } = window.MiniReact;


function App() {
  const [count,setCount] = useState(0)
 
  function handleClick(){
    setCount((count)=> count + 1)
  }



  // console.log("count",count)

  useEffect(()=>{
    console.log("count",count)
  },[count])

  return <div>
    <p>{count}</p>
    <button onClick={handleClick}>加一</button>
  </div>;
}

render(<App/>, document.getElementById('root'));
