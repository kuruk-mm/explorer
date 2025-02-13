const qs: any = require('query-string')
import {
  Vector3,
  ReadOnlyVector3,
  ReadOnlyQuaternion,
  Vector2,
  ReadOnlyVector2
} from 'decentraland-ecs/src/decentraland/math'
import { Observable } from 'decentraland-ecs/src/ecs/Observable'
import { ILand } from 'shared/types'
import { InstancedSpawnPoint } from '../types'
import {
  worldToGrid,
  gridToWorld,
  parseParcelPosition,
  isWorldPositionInsideParcels
} from 'atomicHelpers/parcelScenePositions'
import { DEBUG } from "../../config"
import { isInsideWorldLimits } from '@dcl/schemas'

declare var location: any
declare var history: any

export type PositionReport = {
  /** Camera position, world space */
  position: ReadOnlyVector3
  /** Camera rotation */
  quaternion: ReadOnlyQuaternion
  /** Camera rotation, euler from quaternion */
  rotation: ReadOnlyVector3
  /** Camera height, relative to the feet of the avatar or ground */
  playerHeight: number
  /** Should this position be applied immediately */
  immediate: boolean
}
export type ParcelReport = {
  /** Parcel where the user was before */
  previousParcel?: ReadOnlyVector2
  /** Parcel where the user is now */
  newParcel: ReadOnlyVector2
  /** Should this position be applied immediately */
  immediate: boolean
}

export const positionObservable = new Observable<Readonly<PositionReport>>()
// Called each time the user changes  parcel
export const parcelObservable = new Observable<ParcelReport>()

export const teleportObservable = new Observable<ReadOnlyVector2>()

export const lastPlayerPosition = new Vector3()
export let lastPlayerParcel: Vector2

positionObservable.add((event) => {
  lastPlayerPosition.copyFrom(event.position)
})

// Listen to position changes, and notify if the parcel changed
positionObservable.add(({ position, immediate }) => {
  const parcel = Vector2.Zero()
  worldToGrid(position, parcel)
  if (!lastPlayerParcel || parcel.x !== lastPlayerParcel.x || parcel.y !== lastPlayerParcel.y) {
    parcelObservable.notifyObservers({ previousParcel: lastPlayerParcel, newParcel: parcel, immediate })
    if (!lastPlayerParcel) {
      lastPlayerParcel = parcel
    } else {
      lastPlayerParcel.copyFrom(parcel)
    }
  }
})

export function initializeUrlPositionObserver() {
  let lastTime: number = performance.now()

  function updateUrlPosition(newParcel: ReadOnlyVector2) {
    // Update position in URI every second
    if (performance.now() - lastTime > 1000) {
      replaceQueryStringPosition(newParcel.x, newParcel.y)
      lastTime = performance.now()
    }
  }

  parcelObservable.add(({ newParcel }) => {
    updateUrlPosition(newParcel)
  })

  if (lastPlayerPosition.equalsToFloats(0, 0, 0)) {
    // LOAD INITIAL POSITION IF SET TO ZERO
    const query = qs.parse(location.search)

    if (query.position) {
      let [x, y] = query.position.split(',')
      x = parseFloat(x)
      y = parseFloat(y)

      if (!isInsideWorldLimits(x, y)) {
        x = 0
        y = 0
        replaceQueryStringPosition(x, y)
      }
      gridToWorld(x, y, lastPlayerPosition)
    } else {
      lastPlayerPosition.x = Math.round(Math.random() * 10) - 5
      lastPlayerPosition.z = 0
    }
  }
}

function replaceQueryStringPosition(x: any, y: any) {
  const currentPosition = `${x | 0},${y | 0}`
  const q = qs.parse(location.search)
  q.position = currentPosition

  history.replaceState({ position: currentPosition }, 'position', `?${qs.stringify(q)}`)
}

/**
 * Computes the spawn point based on a scene.
 *
 * The computation takes the spawning points defined in the scene document and computes the spawning point in the world based on the base parcel position.
 *
 * @param land Scene on which the player is spawning
 */
export function pickWorldSpawnpoint(land: ILand): InstancedSpawnPoint {
  const pick = pickSpawnpoint(land)

  const spawnpoint = pick || { position: { x: 0, y: 0, z: 0 } }

  const baseParcel = land.sceneJsonData.scene.base
  const [bx, by] = baseParcel.split(',')

  const basePosition = new Vector3()

  const { position, cameraTarget } = spawnpoint

  gridToWorld(parseInt(bx, 10), parseInt(by, 10), basePosition)

  return {
    position: basePosition.add(position),
    cameraTarget: cameraTarget ? basePosition.add(cameraTarget) : undefined
  }
}

function pickSpawnpoint(land: ILand): InstancedSpawnPoint | undefined {
  if (!land.sceneJsonData || !land.sceneJsonData.spawnPoints || land.sceneJsonData.spawnPoints.length === 0) {
    return undefined
  }

  // 1 - default spawn points
  const defaults = land.sceneJsonData.spawnPoints.filter(($) => $.default)

  // 2 - if no default spawn points => all existing spawn points
  const eligiblePoints = defaults.length === 0 ? land.sceneJsonData.spawnPoints : defaults

  // 3 - pick randomly between spawn points
  const { position, cameraTarget } = eligiblePoints[Math.floor(Math.random() * eligiblePoints.length)]

  // 4 - generate random x, y, z components when in arrays
  let finalPosition = {
    x: computeComponentValue(position.x),
    y: computeComponentValue(position.y),
    z: computeComponentValue(position.z)
  }

  // 5 - If the final position is outside the scene limits, we zero it
  if (!DEBUG) {
    const sceneBaseParcelCoords = land.sceneJsonData.scene.base.split(',')
    const sceneBaseParcelWorldPos = gridToWorld(parseInt(sceneBaseParcelCoords[0], 10), parseInt(sceneBaseParcelCoords[1], 10))
    let finalWorldPosition = {
      x: sceneBaseParcelWorldPos.x + finalPosition.x,
      y: finalPosition.y,
      z: sceneBaseParcelWorldPos.z + finalPosition.z
    }

    if (!isWorldPositionInsideParcels(land.sceneJsonData.scene.parcels, finalWorldPosition)) {
      finalPosition.x = 0
      finalPosition.z = 0
    }
  }

  return {
    position: finalPosition,
    cameraTarget
  }
}

function computeComponentValue(x: number | number[]) {
  if (typeof x === 'number') {
    return x
  }

  if (x.length !== 2) {
    throw new Error(`array must have two values ${JSON.stringify(x)}`)
  }

  let [min, max] = x

  if (min === max) return max

  if (min > max) {
    const aux = min
    min = max
    max = aux
  }

  return Math.random() * (max - min) + min
}

export function getLandBase(land: ILand): { x: number; y: number } {
  if (
    land.sceneJsonData &&
    land.sceneJsonData.scene &&
    land.sceneJsonData.scene.base &&
    typeof (land.sceneJsonData.scene.base as string | void) === 'string'
  ) {
    return parseParcelPosition(land.sceneJsonData.scene.base)
  } else {
    return parseParcelPosition(land.mappingsResponse.parcel_id)
  }
}
