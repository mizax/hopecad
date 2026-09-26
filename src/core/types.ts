export interface Vec {
  x: number
  y: number
}

/** V, X, I — по ГОСТ-разделке; C — «по факту»: шов задан шириной сверху и снизу */
export type WeldType = 'V' | 'X' | 'I' | 'C'
export type Side = 'L' | 'R'
export type Surface = 'outer' | 'inner' | 'cap' | 'root'

export interface Pipe {
  /** Наружный диаметр, мм */
  od: number
  /** Толщина стенки, мм */
  t: number
}

export interface Weld {
  type: WeldType
  /** Угол скоса кромки от вертикали, ° */
  bevel: number
  /** Зазор в корне, мм */
  gap: number
  /** Притупление, мм */
  land: number
  /** Высота валика усиления, мм */
  capH: number
  /** Заход усиления на основной металл с каждой стороны, мм */
  capOver: number
  /** Высота проплава, мм */
  rootH: number
  /** Заход проплава с каждой стороны, мм */
  rootOver: number
  /** Для «по факту»: ширина шва по наружной поверхности, мм */
  widthTop: number
  /** Для «по факту»: ширина шва по внутренней поверхности, мм */
  widthBottom: number
  /** Смещение кромок: правая стенка выше левой на столько мм (− ниже) */
  misalign: number
}

export interface Wedge {
  /** Длина призмы, мм */
  length: number
  /** Высота призмы, мм */
  height: number
  /** Стрела: от точки ввода до передней грани, мм */
  front: number
}

export interface Probe {
  id: string
  name: string
  side: Side
  /** Угол ввода в сталь, ° */
  angle: number
  /** Расстояние от оси шва до точки ввода по наружной поверхности, мм */
  s: number
  /** Число участков луча: 1 — прямой, 2 — однократно отражённый, ... */
  legs: number
  color: string
  visible: boolean
  wedge: Wedge
}

export interface Scheme {
  version: 1
  pipe: Pipe
  weld: Weld
  probes: Probe[]
}

/** Дуга окружности: от a0 против часовой стрелки на sweep радиан */
export interface Arc {
  name: Surface
  cx: number
  cy: number
  rho: number
  a0: number
  sweep: number
}

export interface Wall {
  /** Наружный радиус, мм */
  R: number
  /** Внутренний радиус, мм */
  r: number
}

export interface Geometry {
  /** Номинальные радиусы (левая стенка) */
  R: number
  r: number
  t: number
  /** Стенка слева и справа от шва; различаются при смещении кромок */
  wall: Record<Side, Wall>
  /** Кромка справа от оси, от внутренней поверхности к наружной */
  faceR: Vec[]
  /** Кромка слева */
  faceL: Vec[]
  /** Края валика усиления: расстояние от оси по x и полярный угол, рад */
  capEdge: Record<Side, { x: number; angle: number }>
  capApexY: number
  rootApexY: number
  /** Граница металла, от которой отражается луч */
  arcs: Arc[]
  /** То же без валика и проплава — для наведения */
  bareArcs: Arc[]
  /** Контур металла шва для отрисовки */
  weldPolygon: Vec[]
  /** Основной металл: левая и правая половины кольца */
  basePolygons: Vec[][]
}
