import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, ClipPath, G, Path, Rect, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Matter from 'matter-js';
import { actions, Action } from '../data/actions';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const GLASS_WIDTH = 160;
const GLASS_HEIGHT = 280;
const SVG_VIEW_WIDTH = 200;
const SVG_VIEW_HEIGHT = 350;
const ICE_WIDTH = Math.min(50, GLASS_WIDTH * 0.3);
const ICE_HEIGHT = Math.min(40, GLASS_HEIGHT * 0.12);
const ICE_SIZE = Math.min(ICE_WIDTH - 4, ICE_HEIGHT - 4) * 2;
const WALL_THICKNESS = 20;
const MAX_FILL_HEIGHT_PERCENT = 90;

type LiquidState = {
  level: number;
  color: string;
  opacity: number;
};

type IcePosition = {
  id: number;
  x: number;
  y: number;
  angle: number;
};

type ExecutedAddIce = {
  type: 'add_ice';
  iceCubes: { body: Matter.Body; id: number }[];
};

type ExecutedAddLiquid = {
  type: 'add_liquid';
  previousState: LiquidState | null;
  newState: LiquidState;
};

type ExecutedAction = ExecutedAddIce | ExecutedAddLiquid;

function parseRgb(color: string): { r: number; g: number; b: number } | null {
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
  };
}

function liquidGradientColors(color: string, opacity: number): [string, string, string] {
  const rgb = parseRgb(color);
  const op = opacity / 100;
  if (!rgb) {
    return [
      `rgba(150,200,220,${op * 0.8})`,
      `rgba(130,180,200,${op * 0.9})`,
      `rgba(110,160,180,${op})`,
    ];
  }
  const rMid = Math.floor(rgb.r * 0.85);
  const gMid = Math.floor(rgb.g * 0.85);
  const bMid = Math.floor(rgb.b * 0.85);
  const rBottom = Math.floor(rgb.r * 0.7);
  const gBottom = Math.floor(rgb.g * 0.7);
  const bBottom = Math.floor(rgb.b * 0.7);
  return [
    `rgba(${rgb.r},${rgb.g},${rgb.b},${op * 0.8})`,
    `rgba(${rMid},${gMid},${bMid},${op * 0.9})`,
    `rgba(${rBottom},${gBottom},${bBottom},${op})`,
  ];
}

export default function StatesScreen() {
  const [executedActions, setExecutedActions] = useState<ExecutedAction[]>([]);
  const currentActionIndex = executedActions.length - 1;
  const [liquidState, setLiquidState] = useState<LiquidState>({
    level: 0,
    color: 'rgb(150, 200, 220)',
    opacity: 0,
  });
  const [icePositions, setIcePositions] = useState<IcePosition[]>([]);

  const engineRef = useRef<Matter.Engine | null>(null);
  const worldRef = useRef<Matter.World | null>(null);
  const iceBodiesRef = useRef<Map<number, Matter.Body>>(new Map());
  const nextIdRef = useRef(0);
  const runnerRef = useRef<Matter.Runner | null>(null);

  const animLiquidHeight = useRef(new Animated.Value(0)).current;
  const animLiquidY = useRef(new Animated.Value(SVG_VIEW_HEIGHT)).current;

  // Animate liquid level when liquidState changes (0.5s ease-out)
  useEffect(() => {
    const targetHeight =
      (liquidState.level / 100) * (MAX_FILL_HEIGHT_PERCENT / 100) * SVG_VIEW_HEIGHT;
    const targetY = SVG_VIEW_HEIGHT - targetHeight;
    Animated.parallel([
      Animated.timing(animLiquidHeight, {
        toValue: targetHeight,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(animLiquidY, {
        toValue: targetY,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    ]).start();
  }, [liquidState.level]);

  // Matter.js engine and walls setup (once)
  useEffect(() => {
    const engine = Matter.Engine.create();
    const world = engine.world;
    engine.world.gravity.y = 1;

    const topLeft = 0;
    const topRight = GLASS_WIDTH;
    const bottomLeft = GLASS_WIDTH * 0.1;
    const bottomRight = GLASS_WIDTH * 0.9;

    const leftWallHeight = Math.sqrt(
      Math.pow(GLASS_HEIGHT, 2) + Math.pow(bottomLeft - topLeft, 2)
    );
    const leftWallAngle = Math.atan2(bottomLeft - topLeft, GLASS_HEIGHT);
    const leftWall = Matter.Bodies.rectangle(
      (topLeft + bottomLeft) / 2 - WALL_THICKNESS / 2,
      GLASS_HEIGHT / 2,
      WALL_THICKNESS,
      leftWallHeight,
      {
        isStatic: true,
        angle: leftWallAngle,
        friction: 0.1,
        restitution: 0.2,
      }
    );

    const rightWallHeight = Math.sqrt(
      Math.pow(GLASS_HEIGHT, 2) + Math.pow(topRight - bottomRight, 2)
    );
    const rightWallAngle = -Math.atan2(topRight - bottomRight, GLASS_HEIGHT);
    const rightWall = Matter.Bodies.rectangle(
      (topRight + bottomRight) / 2 + WALL_THICKNESS / 2,
      GLASS_HEIGHT / 2,
      WALL_THICKNESS,
      rightWallHeight,
      {
        isStatic: true,
        angle: rightWallAngle,
        friction: 0.1,
        restitution: 0.2,
      }
    );

    const bottomWall = Matter.Bodies.rectangle(
      GLASS_WIDTH / 2,
      GLASS_HEIGHT + WALL_THICKNESS / 2 - 5,
      bottomRight - bottomLeft + 20,
      WALL_THICKNESS,
      { isStatic: true, friction: 0.3, restitution: 0.1 }
    );

    Matter.World.add(world, [leftWall, rightWall, bottomWall]);

    engineRef.current = engine;
    worldRef.current = world;

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    runnerRef.current = runner;

    return () => {
      const runner = runnerRef.current as (Matter.Runner & { enabled?: boolean }) | null;
      if (runner && 'enabled' in runner) {
        runner.enabled = false;
      }
      engineRef.current = null;
      worldRef.current = null;
    };
  }, []);

  // Sync ice positions from Matter to state
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const map = iceBodiesRef.current;
      if (map.size === 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      const positions: IcePosition[] = [];
      map.forEach((body, id) => {
        positions.push({
          id,
          x: body.position.x,
          y: body.position.y,
          angle: body.angle * (180 / Math.PI),
        });
      });
      setIcePositions(positions);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  function executeAction(action: Action) {
    if (action.action_type === 'add_ice') {
      const world = worldRef.current;
      if (!world) return;
      const cubes: { body: Matter.Body; id: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const id = nextIdRef.current++;
        const startX = GLASS_WIDTH * 0.25 + Math.random() * (GLASS_WIDTH * 0.5);
        const startY = -ICE_SIZE;
        const body = Matter.Bodies.rectangle(
          startX,
          startY,
          ICE_SIZE,
          ICE_SIZE,
          {
            chamfer: { radius: 5 },
            friction: 0.3,
            frictionAir: 0.01,
            restitution: 0.2,
            density: 0.001,
          }
        );
        Matter.World.add(world, body);
        iceBodiesRef.current.set(id, body);
        cubes.push({ body, id });
      }
      setExecutedActions((prev) => [
        ...prev,
        { type: 'add_ice', iceCubes: cubes },
      ]);
    } else if (action.action_type === 'add_liquid') {
      const previousState = { ...liquidState };
      const newState: LiquidState = {
        level: action.liquid_level,
        color: action.liquid_color,
        opacity: action.liquid_opacity,
      };
      setLiquidState(newState);
      setExecutedActions((prev) => [
        ...prev,
        {
          type: 'add_liquid',
          previousState: previousState.level > 0 || previousState.opacity > 0 ? previousState : null,
          newState,
        },
      ]);
    }
  }

  function undoAction() {
    const last = executedActions[executedActions.length - 1];
    if (!last) return;

    if (last.type === 'add_ice') {
      const world = worldRef.current;
      if (world) {
        last.iceCubes.forEach(({ body, id }) => {
          Matter.World.remove(world, body);
          iceBodiesRef.current.delete(id);
        });
      }
    } else if (last.type === 'add_liquid') {
      if (last.previousState) {
        setLiquidState(last.previousState);
      } else {
        setLiquidState({
          level: 0,
          color: 'rgb(150, 200, 220)',
          opacity: 0,
        });
      }
    }
    setExecutedActions((prev) => prev.slice(0, -1));
  }

  function handleNext() {
    const nextIndex = executedActions.length;
    if (nextIndex >= actions.length) return;
    executeAction(actions[nextIndex]);
  }

  function handlePrevious() {
    if (executedActions.length === 0) return;
    undoAction();
  }

  const liquidColors = liquidGradientColors(liquidState.color, liquidState.opacity);

  const scaleX = SVG_VIEW_WIDTH / GLASS_WIDTH;
  const scaleY = SVG_VIEW_HEIGHT / GLASS_HEIGHT;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bartenda - Actions</Text>

      <View style={styles.glassContainer}>
        <Svg
          width={GLASS_WIDTH}
          height={GLASS_HEIGHT}
          viewBox={`0 0 ${SVG_VIEW_WIDTH} ${SVG_VIEW_HEIGHT}`}
          style={styles.glassSvg}
        >
          <Defs>
            <ClipPath id="glass">
              <Path d="M 0 0 L 200 0 L 180 350 L 20 350 Z" />
            </ClipPath>
            <SvgLinearGradient id="glassBgGradient" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="rgba(235,240,248,0.95)" />
              <Stop offset="0.2" stopColor="rgba(245,248,255,0.8)" />
              <Stop offset="0.5" stopColor="rgba(255,255,255,0.65)" />
              <Stop offset="0.8" stopColor="rgba(245,248,255,0.8)" />
              <Stop offset="1" stopColor="rgba(235,240,248,0.95)" />
            </SvgLinearGradient>
            <SvgLinearGradient id="iceGradient" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0" stopColor="rgba(255,255,255,0.95)" />
              <Stop offset="0.3" stopColor="rgba(220,240,255,0.8)" />
              <Stop offset="0.6" stopColor="rgba(180,220,245,0.7)" />
              <Stop offset="1" stopColor="rgba(200,230,250,0.85)" />
            </SvgLinearGradient>
            <SvgLinearGradient id="liquidGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={liquidColors[0]} />
              <Stop offset="0.5" stopColor={liquidColors[1]} />
              <Stop offset="1" stopColor={liquidColors[2]} />
            </SvgLinearGradient>
          </Defs>

          <G clipPath="url(#glass)">
            {/* Glass background */}
            <Rect
              x={0}
              y={0}
              width={SVG_VIEW_WIDTH}
              height={SVG_VIEW_HEIGHT}
              fill="url(#glassBgGradient)"
            />
            {/* Ice cubes (Matter coords -> SVG coords) - behind liquid */}
            {icePositions.map((pos) => (
              <G
                key={pos.id}
                transform={`translate(${pos.x * scaleX}, ${pos.y * scaleY}) rotate(${pos.angle}) translate(${(-ICE_SIZE / 2) * scaleX}, ${(-ICE_SIZE / 2) * scaleY})`}
              >
                <Rect
                  x={0}
                  y={0}
                  width={ICE_SIZE * scaleX}
                  height={ICE_SIZE * scaleY}
                  rx={4}
                  fill="url(#iceGradient)"
                  stroke="rgba(180,210,240,0.5)"
                  strokeWidth={1}
                />
                <Rect
                  x={(ICE_SIZE - 22) * scaleX}
                  y={(ICE_SIZE - 14) * scaleY}
                  width={16 * scaleX}
                  height={8 * scaleY}
                  rx={3}
                  fill="rgba(200,225,245,0.5)"
                />
              </G>
            ))}
            {/* Liquid (animated) */}
            <AnimatedRect
              x={0}
              y={animLiquidY}
              width={SVG_VIEW_WIDTH}
              height={animLiquidHeight}
              fill="url(#liquidGradient)"
            />
          </G>
          <Path
            d="M 0 0 L 200 0 L 180 350 L 20 350 Z"
            fill="none"
            stroke="rgba(180,200,220,0.9)"
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={[
            styles.navButton,
            currentActionIndex < 0 && styles.navButtonDisabled,
          ]}
          onPress={handlePrevious}
          disabled={currentActionIndex < 0}
        >
          <LinearGradient
            colors={['#74b9ff', '#0984e3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.navButtonGradient}
          >
            <Text style={styles.navButtonText}>Previous</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          style={[
            styles.navButton,
            currentActionIndex >= actions.length - 1 && styles.navButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={currentActionIndex >= actions.length - 1}
        >
          <LinearGradient
            colors={['#74b9ff', '#0984e3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.navButtonGradient}
          >
            <Text style={styles.navButtonText}>Next</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 40,
  },
  title: {
    color: '#333333',
    fontSize: 20,
    fontWeight: '300',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  glassContainer: {
    width: GLASS_WIDTH,
    height: GLASS_HEIGHT,
  },
  glassSvg: {
    width: GLASS_WIDTH,
    height: GLASS_HEIGHT,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  navButton: {
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#0984e3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 4,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  navButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
