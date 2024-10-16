---
title: How I Created My Own Background Jobs Server At Home in TypeScript
tags:
  - typescript
  - nodejs
  - nextjs
  - react
date: '2024-05-03'
---
There are very good cloud services available to create background jobs in Nextjs serverless environments (such as Vercel or Netlify), however, they have a big problem. There is a function timeout on each call and therefore you cannot have long-running background jobs in there.

That's why I decide to start my own background jobs server, but with a totally new approach. I wanted it use the same code but extract the job functions and run them in a docker container. It can be easily run on an old laptop or home PC.

## 1\. Define job functions

I checked and compared multiple npm packages and decided to use `Cron` npm package for job functions. To install it,

```javascript
npm i cron
```

Cron npm package, lets me to define functions and assign cron time string to run them. Therefore, it's a great choice for me.

Then, create a folder in your code called `worker`, and inside that create a file called `run-jobs.ts`

```javascript
// run-jobs.ts

import { CronJob } from "cron";

export const mySpecialFunction = async () => {
  console.log("Function Started!");

  const job1 = CronJob.from({
    cronTime: "0 */2 * * *",
    onTick: async () => {
      console.log(`job1 started at ${new Date().toLocaleString()}`);

    /// DO WHATEVER YOU WANT TO DO HERE      

      console.log(`job1 finished at ${new Date().toLocaleString()}`);
    },
    onComplete: () => console.log("job1 ended"),
    start: true,
    timeZone: "Australia/Sydney",
  });
};

(async () => {
  console.log("Worker Started!");
  await mySpecialFunction();
})();
```

Now, you have a file that starts a function. You can define as many functions you want here, each with a different cron time string.

To learn more about how cron functions are defined take a look [here](https://www.npmjs.com/package/cron)

To learn more about how cron time string should be defined, use this [crontab.guru tool](https://crontab.guru/)

## 2\. Extract functions code using Webpack

In order to run functions in a docker container, first I needed to extract them out of the code. There is no need to include all the codebase into the docker container. This way, your container will be as small as possible and can be run on a small Laptop or PC at home easily.

In order to use Webpack, first we need to install it:

```javascript
npm install --save-dev webpack
```

You also need to install ts-loader package to be able to use typescript files in webpack:

```javascript
npm install --save-dev ts-loader
```

Then, inside your worker folder, create a file called _webpack.config.js :_

```javascript
const path = require('path');

module.exports = {
  mode: "development",
  entry: './run-jobs.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: {
        '@': path.resolve(__dirname, '../src/'),
      },
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  target: 'node', // Important for Node.js specific modules
};
```

In this config file, we are telling webpack to start from 'run-jobs.ts' file from current folder path. It tried to extract the code (with all their dependencies) into a bundle or package defined in the 'output' section.

We added ts-loader plugin for webpack, so that it can work with Typescript files. Also, if you are using '@' in your import paths, you need to define where this '@' refers to. This is what I did in 'alias' section.

You can test this easily with running this command in your worker folder:

```javascript
npx webpack
```

This should start webpack and based on the config we defined, extract the code require to run jobs and bundle them into a .js file called bundle.js in a folder called 'dist'.

## 3\. Defining Docker Container

Creating a docker container is easy now since everything is ready. First create a file called 'Dockerfile' in worker folder:

```javascript
FROM node:18.19.0

WORKDIR /app

COPY node_modules/ ./node_modules

COPY dist/* .

CMD ["node", "bundle.js"]
```

This file tells docker on what to do in order to create the docker container to run jobs. Remember that you cannot access any file outside of this folder in Dockerfile.

## 4\. Run it!

Now, it's time to put everything together, create the docker and run it for the first time. Create a bash file called 'build-and-run.sh' and put these command in it:

```javascript
rm -rf dist
rm -rf node_modules

(cd .. && npm i)
(cd .. && cp -r node_modules worker)

npx webpack

docker build -t my-jobs-img .

docker run --detach --rm --env-file .env --name my-jobs my-jobs-img
```

Couple of points:

*   You need to do npm install first so that all dependencies already exist before you run Webpack. Webpack expects to have access to all node\_modules when you run it.
    
*   Docker cannot copy node\_modules from outside folders, therefore I copy node\_modules from upper-folder into this folder first.
    
*   `Docker Build` runs docker based on the Dockerfile we created before and creates the docker image for us.
    
*   `Docker Run` starts the docker in detach mode. Note that I copied my env file and referencing it to the docker container. This way all your environment variables will be available inside the container.
    
*   I like to use `--rm` so that when the container is finished/stopped, docker automatically deletes it, so that there is no name conflict in future runs.
    

## 5\. Run It At Home

I'm not recommending it, but if you want to run it at home on an old laptop/pc, you just need to install docker on it, pull the code base on it, and run this shell script on it.

Voila, now you can have infinite number of jobs defined and you won't be bounded by Vercel serverless function timeout or any other platform :)

Let me know what you think about it, you can find me on [Twitter (X) here](https://twitter.com/programmerByDay)
