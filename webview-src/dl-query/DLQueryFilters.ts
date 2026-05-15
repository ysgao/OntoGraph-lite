import type { DLQueryType, ResultGroup } from '../../src/views/DLQueryMessages.js';

const OWL_THING   = 'http://www.w3.org/2002/07/owl#Thing';
const OWL_NOTHING = 'http://www.w3.org/2002/07/owl#Nothing';

const SUPERCLASS_TYPES: DLQueryType[] = ['directSuperClasses', 'superClasses', 'equivalentClasses'];
const SUBCLASS_TYPES:   DLQueryType[] = ['directSubClasses', 'subClasses'];

export function filterGroups(
  groups: ResultGroup[],
  nameFilter: string,
  showOwlThing: boolean,
  showOwlNothing: boolean,
): ResultGroup[] {
  const lc = nameFilter.toLowerCase();

  return groups
    .map(group => {
      let entities = group.entities;

      if (!showOwlThing && SUPERCLASS_TYPES.includes(group.queryType)) {
        entities = entities.filter(e => e.iri !== OWL_THING);
      }
      if (!showOwlNothing && SUBCLASS_TYPES.includes(group.queryType)) {
        entities = entities.filter(e => e.iri !== OWL_NOTHING);
      }
      if (lc) {
        entities = entities.filter(
          e => e.label.toLowerCase().includes(lc) || e.iri.toLowerCase().includes(lc),
        );
      }

      return { ...group, entities };
    })
    .filter(group => group.entities.length > 0);
}
