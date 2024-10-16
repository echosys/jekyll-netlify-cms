---
title: 'The Difference Between Coding, Machine Learning and Deep Learning'
date: '2023-03-27'
tags:
  - ai
  - coding
  - deep-learning
  - machine-learning
  - neural-network
header:
  overlay_image: /img/posts/pexels-pavel-danilyuk-8438918.jpg
---
I have been a software engineer and developer for more than a decade now. Writing code has always been a fun part of my day, generally it's a way to solve a problem and telling a computer machine what the solution is and how to execute it. However, in recent years (during university and work) I was introduced to different ways of solving problems. and, that is using Artificial Intelligence or AI to solve problems.

AI is a broad concept and I'm not going to define it here in this post. However, I want to point out to an aspect of it. One aspect of AI is when use it to solve a problem for us.

## What is coding?

We write code (in the form of programming languages) to solve a problem. Whenever we write code, we need to know 4 things:

*   the problem definition itself,
    
*   the input parameters of it,
    
*   the expected output of it,
    
*   and how to solve that problem using input parameters and generate the expected outcome
    

When we know these 4 items, we can start writing machine instructions in a programming language. As we know, a computer reads those instructions and executes them line by line.

## How AI solves a problem

AI is a broad and complex concept. But in general, the idea is AI solves a problem without us instructing the machine on how exactly to solve it. That means, instead of the 4 items I mentioned above, we only care about these 3 items:

*   the problem definition itself,
    
*   the input parameters of it,
    
*   the expected output,
    

The AI is responsible to figure out the fourth item (how to solve that problem using input parameters and generate the expected outcome). This is mimicking human intelligence, hence the name Artificial Intelligence.

In recent years, this aspect has advanced a lot and got us to the era of AI systems like ChatGPT. I have always been fascinated with this idea. There are 2 different ways for AI to figure out the execution model. The big two categories are: Machine Learning and Deep Learning.

Let me explain...

## What is Machine Learning?

As you remember, in AI problem space , we have the problem, the inputs and the expected outputs. Machine Learning (ML) is when we try to find patterns and associations between inputs (or a subset of it) and expected outputs. That pattern/association becomes the execution model. In order to find that association, first we need to have a sample of input data and outputs, then we use couple of pre-defined techniques on them. Each technique examines input data from a certain aspect and looks for a predefined relation in those data. Some of the very famous ones are:

*   Classification
    
*   Clustering
    
*   Regression
    

These techniques generally try to "define the input data" and generate rules. Rules such as:

_If a person age is between 18 and 25 AND he is carrying books Then he is a student. (with accuracy/probability of 76%)_

Or

_Items with input features of (A,B, and C) are very similar and can be considered as a group_

Or

_Salary of an employee can be predicted and calculated with an equation like ......_

The more sample data we have, the better is the accuracy of found rules. These rule are then get executed on a computer.

## What is Deep Learning?

Now that I explained Coding, AI problem solving and Machine Learning, it's easier to talk about Deep Learning and its difference with Machine Learning.

Similar to Machine Learning, here we have inputs and the expected outputs. Machine Learning is good in finding a 1-Dimension association between inputs and outputs, however it gets really complicated and incapable when the inputs are very large and complex (like an image, sound or a video). That's when deep learning comes to the scene...

Deep learning uses Artificial Neural Network (ANN) to find the execution model between inputs and outputs. Neural Networks is a complicated and vast subject by itself. It can have multiple layers of Neurons and therefore is capable of digesting a complex input and through a network of layers of neurons create an execution model.

The name Deep Learning is because the solution knowledge is deep into the network of layers of neurons and their interconnections.

![](https://www.armannotes.com/img/posts/simple-nn.webp)

Neural Network works great with complex input types. Therefore, it has been used extensively in solving problems like Object Detection in photos, Image category recognition, Machine Translation, and so on.

## TakeAway

In recent year, AI has been used to solve problems heavily. Two common approaches are Machine Learning and Deep Learning.

Machine Learning is when we use sample data to find patterns and associations between inputs and expected outputs. These patterns are written in the form of rules.

Deep Learning is when we use sample data to create (a.k.a train) a neural network as our execution model.

The more sample data we have, the better and more accurate our execution models are.
