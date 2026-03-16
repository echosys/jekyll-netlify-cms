




//m1pro 
pyenv 
  3.12.3 ~/.pyenv/versions/3.12.3/bin/python

anaconda 
  3.11.7 /opt/homebrew/anaconda3/bin/python

homebrew 
  3.13.1 /opt/homebrew/bin/python3
  3.12.3 /opt/homebrew/bin/python3.12  removed 
system 
  3.9.6 /usr/bin/python3

//clean up 
  brew list | grep python
  brew uses --installed python
  brew uninstall python@3.12
  brew uninstall python@3.13

//configure pyenv 
  ~/.zprofile → read once at login (good for PATH modifications that need to persist)
  ~/.zshrc → read for every interactive shell (good for shell features, aliases, pyenv shims init)

  export PYENV_ROOT="$HOME/.pyenv"
  export PATH="$PYENV_ROOT/bin:$PATH"

  brew install pyenv-virtualenv

  zshrc 
  # pyenv initialization for interactive shells
  eval "$(pyenv init --path)"
  eval "$(pyenv init -)"
  eval "$(pyenv virtualenv-init -)"

//how to use pyenv 
  
  pyenv versions 
  pyenv global 3.12.3
  pyenv local 3.12.3
  pyenv shell 3.12.3
  
  which python
  which python3
    /Users/jcvd/.pyenv/shims/python3
  pyenv versions

//python venv
  pyenv install 3.12.3
  pyenv local 3.12.3    # sets the version for this folder/project
  python -m venv .venv   # creates a virtualenv inside project folder
  source .venv/bin/activate
  pip install packages    # isolated to this project


//create venv with pyenv, the virtual environment is created inside pyenv’s root directory, specifically under:
~/.pyenv/versions/picasa

  don't use 3.11 for GUI 
  pyenv uninstall 3.11.14
  PYTHON_CONFIGURE_OPTS="--enable-framework" pyenv install 3.12.3
  pyenv virtualenv 3.12.3 picasa 
  python3 -m pip install -r requirements.txt
  pyenv activate picasa 
  pyenv versions 
  pyenv deactivate 
  

//osx m1pro to run 
  pyenv activate picasa 
  cd picasa
  python3 main.py   

