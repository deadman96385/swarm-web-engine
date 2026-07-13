const VERTEX_SHADER=`
attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute float a_pressure;
uniform vec2 u_resolution;
varying vec2 v_texCoord;
varying vec3 v_color;
void main(){
  vec2 clip=(a_position/u_resolution)*2.0-1.0;
  gl_Position=vec4(clip.x,-clip.y,0.0,1.0);
  v_texCoord=a_texCoord;
  v_color=vec3(0.0,a_pressure*0.75,a_pressure);
}`;

const FRAGMENT_SHADER=`
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoord;
varying vec3 v_color;
void main(){
  vec4 sample=texture2D(u_texture,v_texCoord);
  gl_FragColor=vec4(sample.rgb*v_color,sample.a);
}`;

function compile(gl,type,source){
  const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(message);}
  return shader;
}

function createProgram(gl){
  const program=gl.createProgram(),vertex=compile(gl,gl.VERTEX_SHADER,VERTEX_SHADER),fragment=compile(gl,gl.FRAGMENT_SHADER,FRAGMENT_SHADER);
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const message=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error(message);}
  return program;
}

class BackdropMeshRenderer {
  constructor(mesh){
    const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(mesh.width,mesh.height):document.createElement('canvas');canvas.width=mesh.width;canvas.height=mesh.height;
    const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw new Error('WebGL is unavailable.');
    this.canvas=canvas;this.gl=gl;this.program=createProgram(gl);this.vertexBuffer=gl.createBuffer();this.indexBuffer=gl.createBuffer();this.texture=gl.createTexture();this.uploadedImage=null;
    this.vertexData=new Float32Array(mesh.pointCount*5);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
    gl.useProgram(this.program);gl.uniform2f(gl.getUniformLocation(this.program,'u_resolution'),mesh.width,mesh.height);gl.uniform1i(gl.getUniformLocation(this.program,'u_texture'),0);
    const stride=5*Float32Array.BYTES_PER_ELEMENT;gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
    const position=gl.getAttribLocation(this.program,'a_position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,stride,0);
    const uv=gl.getAttribLocation(this.program,'a_texCoord');gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,stride,2*Float32Array.BYTES_PER_ELEMENT);
    const pressure=gl.getAttribLocation(this.program,'a_pressure');gl.enableVertexAttribArray(pressure);gl.vertexAttribPointer(pressure,1,gl.FLOAT,false,stride,4*Float32Array.BYTES_PER_ELEMENT);
    gl.clearColor(0,0,0,0);gl.disable(gl.BLEND);
  }

  upload(image){
    const gl=this.gl;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);this.uploadedImage=image;
  }

  render(mesh,image){
    if(this.uploadedImage!==image)this.upload(image);
    const gl=this.gl,data=this.vertexData;for(let i=0;i<mesh.pointCount;i++){const at=i*5,p=i*2;data[at]=mesh.positions[p];data[at+1]=mesh.positions[p+1];data[at+2]=(i%mesh.gridX)*.25;data[at+3]=Math.floor(i/mesh.gridX)*.25;data[at+4]=mesh.brightness[i];}
    gl.viewport(0,0,mesh.width,mesh.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(this.program);gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);gl.flush();return this.canvas;
  }
}

export class DynamicBackdrop {
  constructor(width=480,height=800,step=16){
    this.width=width;this.height=height;this.step=step;this.gridX=Math.floor(width/step)+1;this.gridY=Math.floor(height/step)+1;this.pointCount=this.gridX*this.gridY;
    this.positions=new Float32Array(this.pointCount*2);this.velocities=new Float32Array(this.pointCount*2);this.pressures=new Float32Array(this.pointCount);this.brightness=new Float32Array(this.pointCount);this.brightness.fill(.25);
    for(let y=0;y<this.gridY;y++)for(let x=0;x<this.gridX;x++){const p=(y*this.gridX+x)*2;this.positions[p]=x*step;this.positions[p+1]=y*step;}
    const indices=[];for(let y=0;y<this.gridY-1;y++)for(let x=0;x<this.gridX-1;x++){const top=y*this.gridX+x,bottom=top+this.gridX;indices.push(top,bottom+1,bottom,top,top+1,bottom+1);}this.indices=new Uint16Array(indices);this.renderer=null;this.rendererFailed=false;
  }

  update(elapsedSeconds){
    const elapsed=Math.max(.01,Math.min(.1,elapsedSeconds))*2;
    for(let y=0;y<this.gridY;y++)for(let x=0;x<this.gridX;x++){
      const i=y*this.gridX+x,p=i*2;if(y>0&&y<this.gridY-1&&x>0&&x<this.gridX-1){const dx=this.positions[p]-x*this.step,dy=this.positions[p+1]-y*this.step;this.velocities[p]+=-dx*16*elapsed;this.velocities[p+1]+=-dy*16*elapsed;this.velocities[p]*=.95;this.velocities[p+1]*=.95;this.positions[p]+=this.velocities[p]*elapsed;this.positions[p+1]+=this.velocities[p+1]*elapsed;}
      this.brightness[i]=Math.max(.25,Math.min(.9,this.pressures[i]));this.pressures[i]*=.9;
    }
  }

  boomAt(x,y,force,range){
    const centerX=Math.trunc(x/this.step),centerY=Math.trunc(y/this.step),reach=Math.trunc(range/this.step);let minX=centerX-reach;if(minX>this.gridX-1)return;if(minX<1)minX=1;let maxX=centerX+reach+1;if(maxX<1)return;if(maxX>this.gridX-1)maxX=this.gridX-1;let minY=centerY-reach;if(minY>this.gridY-1)return;if(minY<1)minY=1;let maxY=centerY+reach+1;if(maxY<1)return;if(maxY>this.gridY-1)maxY=this.gridY-1;
    for(let row=minY;row<maxY;row++)for(let column=minX;column<maxX;column++){const i=row*this.gridX+column,p=i*2,dx=this.positions[p]-x,dy=this.positions[p+1]-y,distance=Math.hypot(dx,dy);if(distance>=range)continue;const impulse=force*(1-distance/range);if(impulse<=0)continue;const nx=distance?dx/distance:0,ny=distance?dy/distance:0;this.positions[p]+=nx*impulse;this.positions[p+1]+=ny*impulse;this.pressures[i]+=impulse;}
  }

  draw(context,image){
    if(!image)return;if(!this.renderer&&!this.rendererFailed)try{this.renderer=new BackdropMeshRenderer(this);}catch{this.rendererFailed=true;}
    if(this.renderer){context.drawImage(this.renderer.render(this,image),0,0);return;}
    const pattern=context.createPattern(image,'repeat');context.save();context.globalAlpha=.72;context.fillStyle=pattern;context.fillRect(0,0,this.width,this.height);context.restore();
  }

  dispose(){
    if(!this.renderer)return;const {gl,program,vertexBuffer,indexBuffer,texture}=this.renderer;gl.deleteBuffer(vertexBuffer);gl.deleteBuffer(indexBuffer);gl.deleteTexture(texture);gl.deleteProgram(program);this.renderer=null;
  }
}
