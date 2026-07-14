import test from 'node:test';
import assert from 'node:assert/strict';
import { BoardCamera, BOARD_VIEWPORT } from '../src/camera.js';

test('XL camera transforms round-trip and clamp to the 22x24 world',()=>{
  const camera=new BoardCamera({cols:22,rows:24}),point={x:512,y:730},screen=camera.worldToScreen(point),roundTrip=camera.screenToWorld(screen);
  assert.ok(Math.abs(roundTrip.x-point.x)<1e-9&&Math.abs(roundTrip.y-point.y)<1e-9);
  assert.ok(camera.zoom>=camera.fitZoom&&camera.zoom<=camera.maxZoom);camera.panScreen(10000,10000);assert.ok(camera.centerX>=camera.bounds.minX&&camera.centerY>=camera.bounds.minY);
});

test('cursor-anchored zoom preserves the world point and fit restores the overview',()=>{
  const camera=new BoardCamera({cols:22,rows:24}),anchor={x:120,y:260},before=camera.screenToWorld(anchor);assert.equal(camera.boardFullyVisible(),false);camera.zoomAt(1.1,anchor);const after=camera.screenToWorld(anchor);assert.ok(Math.abs(before.x-after.x)<1e-9&&Math.abs(before.y-after.y)<1e-9);camera.fit();assert.equal(camera.zoom,camera.fitZoom);assert.equal(camera.boardFullyVisible(),true);assert.deepEqual(camera.worldToScreen({x:(camera.bounds.minX+camera.bounds.maxX)/2,y:(camera.bounds.minY+camera.bounds.maxY)/2}),{x:BOARD_VIEWPORT.x+BOARD_VIEWPORT.width/2,y:BOARD_VIEWPORT.y+BOARD_VIEWPORT.height/2});camera.zoomAt(camera.fitZoom*1.05,anchor);assert.equal(camera.boardFullyVisible(),false);
});
