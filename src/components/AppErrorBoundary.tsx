import {Component,type ReactNode} from "react";
import {Brand} from "./Brand";

export class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){
    if(this.state.failed)return <main className="not-found" role="alert">
      <Brand/>
      <h1>Necesitamos volver a cargar MiCole</h1>
      <p>Recarga la página para continuar.</p>
      <button className="btn btn-primary" onClick={()=>window.location.reload()}>Recargar MiCole</button>
    </main>;
    return this.props.children;
  }
}
