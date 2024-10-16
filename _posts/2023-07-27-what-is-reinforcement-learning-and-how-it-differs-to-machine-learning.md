---
title: "What is Reinforcement Learning and How it differs to Machine Learning?"
date: "2023-07-27"
tags: 
  - "ai"
  - "machine-learning"
  - "reinforcement-learning"
header:
    overlay_image: "/img/posts/pexels-photo-220051.jpeg"
---

In a previous blog post, I discussed the [differences between Coding, Machine Learning, and Deep Learning](https://armannotes.com/2023/03/27/the-difference-between-coding-machine-learning-and-deep-learning/). Now, I will share my recent learnings about Reinforcement Learning (RL) and explore its distinct nature from the other AI branches.

## Machine Learning vs. Reinforcement Learning

In Machine learning (ML), we have lots of inputs that have our desired output, but we don't know how we can get to that output from these input data fields. ML analyzes this for us and finds some/best way to get from these input fields to our desired output. In simple terms, Machine learning is about finding a way to get from input data to a known output. ML looks for common patterns through lots of data to find this for us.

In reinforcement learning (RL), things are different. Here we don't have a lot of data, but instead we have a feedback function. The way it works is our AI agent starts with a random solution (a path from input data to a known output) and runs the feedback function on it. The feedback function returns a score (usually between 0 to 1), that tells the agent how desirable the solution is. If the solution is getting us closer to our desired output, then it is 1, otherwise it is 0 or a number between 0 and 1.

## The Power of Reinforcement Learning

The main difference in use case between machine learning and reinforcement learning is that in machine learning we must have a lot of data; however, in reinforcement learning we can start with a form of feedback function and no data. It can start from an absolute random position.

RL agent will use this number to form its next iteration and does this many times. Over time, it will get closer and closer to the ideal solution.

The feedback function allows us to explore multiple outputs as well. It can measure a given input against a set of possible outputs, and therefore with RL we don't necessarily need to know the desired output. RL agent can find the best possible path from input to each of these outputs using the feedback function.

P.S: This is only a high-level explanation.

## What are some of the examples for reinforcement learning?

The unique characteristic of reinforcement learning allows it to excel in dynamic and complex scenarios, such as game playing, robotics, recommendation systems and autonomous systems, making it a distinctive and essential approach within these fields.

Some Examples could be:

- **Game Playing**: Algorithms like Deep Q-Networks (DQN) and AlphaGo have demonstrated remarkable success in mastering games like board game Go. These agents learn from the game environment's feedback (rewards) to improve their strategies and eventually achieve superhuman performance.

- **Recommendation Systems**: Reinforcement learning has been employed in recommendation systems to optimize the suggestions provided to users. For example, in online advertising, an RL-based recommendation engine might learn to display ads that lead to more user clicks and conversions, thereby maximizing the cumulative rewards. Some famous use cases are:
    - A system to recommend articles to users to increase their reading time on a news website (usually shown in 'read more' section).
    
    - A product recommendation system (products your might be interested in)
    
    - Finding the best place to show an ad to increase user engagement

- **Navigation**: RL enables robots to learn and adapt their behavior based on the feedback they receive from sensors and actuators. Self-driving cars and autonomous drones utilize reinforcement learning to make decisions on the road or in the air.

- **Resource Management**: Reinforcement learning is utilized in scenarios where efficient resource allocation is essential. For instance, in energy management, RL agents can learn to optimize energy consumption in smart grids, balancing the demand and supply to minimize costs and maintain a stable power supply.

- Other examples include lots of other applications in various industries such as Finance, Automation, Natural Language Processing (NLP), and Healthcare.

## What is Apprentice period of learning?

Every RL agent starts with zero data and information and takes random decisions. This could lead to a long learning time before it becomes any useful. The accuracy of this agent can be so random and aweful at first. In order to speed this phase, there can be a period of learning where the RL agent observes an expert or the current application's logic and learns from it. This is called 'apprentice learning mode'.

In apprentice mode, the agent is given the input with the output chosen by current application or an expert. The agent learns this as the best-known output/action so far and builds on top of that.

Note that, apprentice mode is not necessary and as I said above, an agent can start from absolutely nothing.

## Exploration vs Exploitation in Reinforcement Learning

Exploitation is when the agent returns the current known best action/output (for a given set of input). Exploration is when the agent takes a new and random set of action to learn from it. Exploration helps the agent not to get stuck in local maxima and find better ways to increase its cumulative rewards score.

It is advised to have a trade-off between exploration vs exploitation. For example, 80% of the times agent can return known results, and in 20% of the times it uses randomization to learn more.

## How to design a good feedback reward function?

In RL, an agent interacts with an environment and takes actions to reach a specific objective. After each action, the environment provides feedback to the agent in the form of a reward signal. This reward signal represents the immediate feedback on the goodness or desirability of the agent's action. The feedback can be positive (rewarding) or negative (penalizing), depending on whether the agent made progress toward its objective or deviated from it.

However, designing a useful reward function can be challenging. If the ideal output is known, it can be easier to measure the distance of the current set of actions (solution) to the ideal case. However, in most of the systems where the agent needs to recommend something, it usually waits for a feedback from humans.

For example, in an article recommendation system, the agent picks some articles and shows them to users. When a user clicks on them, this could be scored as a reward for the agent and guide it. On the other hand, if no user clicks on them, this shows the recommendations were not interesting enough, and that it is considered a negative score (penalty) for the agent.

## Conclusion

Reinforcement Learning (RL) is an interesting branch of artificial intelligence. It can tackles problems with a different approach and can be used in scenarios where there is not known data available or the ideal output action is not known. The RL agent can explore various actions and use a reward function to get closer one-step-at-a-time to finding good/best outputs.
