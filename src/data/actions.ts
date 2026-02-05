export type AddLiquidAction = {
  action_type: 'add_liquid';
  liquid_level: number;
  liquid_color: string;
  liquid_opacity: number;
};

export type AddIceAction = {
  action_type: 'add_ice';
};

export type Action = AddLiquidAction | AddIceAction;

export const actions: Action[] = [
  require('../../data/action1.json') as Action,
  require('../../data/action2.json') as Action,
  require('../../data/action3.json') as Action,
  require('../../data/action4.json') as Action,
  require('../../data/action5.json') as Action,
];
