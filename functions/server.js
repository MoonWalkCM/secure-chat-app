const serverless = require('serverless-http');
const express = require('express');
const path = require('path');

// Импортируем основной сервер
const app = require('../server');

// Экспортируем функцию для Netlify
exports.handler = serverless(app); 