import Svg, { Rect } from 'react-native-svg';
import type { AvatarId } from '@workspace/api-client-react';
type Pixel = [number, number, number, number, string];
const skin = '#f0c29a', dark = '#161727';
export function PixelAvatar({ id, size = 100, locked = false }: {id: AvatarId; size?: number; locked?: boolean}) {
  const armored = id === 'knight' || id === 'paladin';
  const armor = id === 'paladin' ? '#f8d061' : id === 'knight' ? '#cbd4e8' : id === 'squire' ? '#9b6a3f' : '#8a6f4e';
  const pixels: Pixel[] = [
    [5,2,6,5,armored ? '#a5afc5' : skin],[5,2,6,1,armored ? armor : '#6b4a35'],
    [6,4,1,1,dark],[9,4,1,1,dark],[4,7,8,5,armor],[3,7,1,4,armor],[12,7,1,4,armor],
    [5,12,2,3,armored ? armor : '#4a3b5c'],[9,12,2,3,armored ? armor : '#4a3b5c'],
    [5,15,2,1,dark],[9,15,2,1,dark],[7,8,2,3,id === 'paladin' ? '#73e5e6' : '#5f5264'],
  ];
  if(id === 'squire') pixels.push([13,3,1,8,'#c9a061'],[12,10,3,1,'#7a5a3a']);
  if(id === 'knight') pixels.push([2,7,1,8,'#b0344a'],[12,8,3,4,'#2d5fa8'],[13,9,1,2,'#f8d061']);
  if(id === 'paladin') pixels.push([0,3,3,3,'#fff2b8'],[1,6,3,1,'#fff2b8'],[13,3,3,3,'#fff2b8'],[12,6,3,1,'#fff2b8'],[5,1,6,1,'#f8d061'],[5,0,1,1,'#f8d061'],[7,0,2,1,'#f8d061'],[10,0,1,1,'#f8d061']);
  return <Svg width={size} height={size} viewBox="0 0 16 16" accessibilityLabel={`${id} avatar`} style={{opacity:locked ? .3 : 1}}>
    <Rect width={16} height={16} fill="#252238"/>
    {id === 'paladin' ? <Rect x={1} y={1} width={14} height={14} fill="#f8d061" opacity={.15}/> : null}
    {pixels.map(([x,y,width,height,fill], index) => <Rect key={index} {...{x,y,width,height,fill}}/>)}
  </Svg>;
}
