import type { FormProfile } from '../types';

export const RELATIONSHIPS_HOME: FormProfile = {
  id: 'Relationships/Home',
  displayName: 'Relationships/Home',
  bundle: 'psych-eval',
  detection: {
    anchors: ['Relationships/Home', 'Overall Quality of Interpersonal Relationships'],
    supporting: ['living situation', 'concerns'],
    categoryIds: [],
  },
  fields: [
    { 
      key: 'interpersonalRelationships', 
      type: 'textarea', 
      labels: ['Overall Quality of Interpersonal Relationships'] 
    },
  ],
};
