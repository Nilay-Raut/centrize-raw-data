/**
 * Knex singleton — import this wherever you need to run DB queries.
 *
 * NEVER create a new Knex instance elsewhere.
 * NEVER import from 'knex' directly in service or route files.
 * All SQL goes through src/db/queries/*.ts files.
 */

import Knex from 'knex';
import { knexConfig } from '../config/db';

const db = Knex(knexConfig);

export default db;
