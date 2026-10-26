// Where each face sits on a die cube, and the cube rotation (degrees) that turns it to the viewer.
export const DIE_FACES = [
  { value: 1, place: "rotateY(0deg)", show: { x: 0, y: 0 } },
  { value: 6, place: "rotateY(180deg)", show: { x: 0, y: 180 } },
  { value: 2, place: "rotateY(90deg)", show: { x: 0, y: -90 } },
  { value: 5, place: "rotateY(-90deg)", show: { x: 0, y: 90 } },
  { value: 3, place: "rotateX(90deg)", show: { x: -90, y: 0 } },
  { value: 4, place: "rotateX(-90deg)", show: { x: 90, y: 0 } },
];
