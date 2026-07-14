import { gridWorldBounds } from './core.js';

export const BOARD_VIEWPORT = Object.freeze({ x:0, y:32, width:480, height:614 });

export class BoardCamera {
  constructor(grid,viewport=BOARD_VIEWPORT,state=null){
    this.grid=grid;this.viewport={...viewport};this.bounds=gridWorldBounds(grid);
    this.fitZoom=Math.min(viewport.width/this.bounds.width,viewport.height/this.bounds.height,1);
    this.minZoom=this.fitZoom;this.maxZoom=1.25;
    this.zoom=state?.zoom??Math.max(this.fitZoom,.72);
    this.centerX=state?.centerX??(this.bounds.minX+this.bounds.maxX)/2;
    this.centerY=state?.centerY??(this.bounds.minY+this.bounds.maxY)/2;
    this.clamp();
  }
  clamp(){
    this.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.zoom));
    const halfW=this.viewport.width/(2*this.zoom),halfH=this.viewport.height/(2*this.zoom),midX=(this.bounds.minX+this.bounds.maxX)/2,midY=(this.bounds.minY+this.bounds.maxY)/2;
    this.centerX=this.bounds.width<=halfW*2?midX:Math.max(this.bounds.minX+halfW,Math.min(this.bounds.maxX-halfW,this.centerX));
    this.centerY=this.bounds.height<=halfH*2?midY:Math.max(this.bounds.minY+halfH,Math.min(this.bounds.maxY-halfH,this.centerY));
  }
  worldToScreen(point){return {x:this.viewport.x+this.viewport.width/2+(point.x-this.centerX)*this.zoom,y:this.viewport.y+this.viewport.height/2+(point.y-this.centerY)*this.zoom};}
  screenToWorld(point){return {x:this.centerX+(point.x-(this.viewport.x+this.viewport.width/2))/this.zoom,y:this.centerY+(point.y-(this.viewport.y+this.viewport.height/2))/this.zoom};}
  boardFullyVisible(epsilon=1e-6){
    const topLeft=this.screenToWorld({x:this.viewport.x,y:this.viewport.y}),bottomRight=this.screenToWorld({x:this.viewport.x+this.viewport.width,y:this.viewport.y+this.viewport.height});
    return topLeft.x<=this.bounds.minX+epsilon&&topLeft.y<=this.bounds.minY+epsilon&&bottomRight.x>=this.bounds.maxX-epsilon&&bottomRight.y>=this.bounds.maxY-epsilon;
  }
  panScreen(dx,dy){this.centerX-=dx/this.zoom;this.centerY-=dy/this.zoom;this.clamp();}
  zoomAt(value,screenPoint){
    const before=this.screenToWorld(screenPoint);this.zoom=value;this.clamp();const after=this.screenToWorld(screenPoint);this.centerX+=before.x-after.x;this.centerY+=before.y-after.y;this.clamp();
  }
  fit(){this.zoom=this.fitZoom;this.centerX=(this.bounds.minX+this.bounds.maxX)/2;this.centerY=(this.bounds.minY+this.bounds.maxY)/2;this.clamp();}
  snapshot(){return {centerX:this.centerX,centerY:this.centerY,zoom:this.zoom};}
}
