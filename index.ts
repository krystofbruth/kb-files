import { Router } from "express";
import { ModuleInitializer } from "if-types";

const moduleInitializer: ModuleInitializer = async (ctx) => {
  const router = Router();

  return { router, methods: {}, contexts: {} };
};

export default moduleInitializer;
