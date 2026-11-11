import {createContext} from 'react';
import type {School} from '../lib/types';
export const SchoolDocumentContext=createContext<School|undefined>(undefined);
